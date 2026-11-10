-- Additive rollout: deploy this before the matching API/frontend changes.
-- Existing orders keep their values; their earlier actions are not invented.
alter table public.orders add column request_fingerprint text
  check (request_fingerprint is null or request_fingerprint ~ '^[a-f0-9]{64}$');

create schema if not exists ssupertea_private;
revoke all on schema ssupertea_private from public, anon, authenticated;

-- One rolling fixed-window record per verified account/action. This persists
-- across Vercel instances and never stores an IP address or access token.
create table ssupertea_private.order_action_limits (
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null check (action in ('create','cancel')),
  window_start timestamptz not null,
  attempts integer not null check (attempts > 0),
  primary key(user_id,action)
);
alter table ssupertea_private.order_action_limits enable row level security;
revoke all on ssupertea_private.order_action_limits from public, anon, authenticated, service_role;
create function public.consume_order_action(p_user_id uuid,p_action text) returns jsonb
language plpgsql security definer set search_path = '' as $function$
declare
  rate ssupertea_private.order_action_limits%rowtype;
  maximum integer;
  moment timestamptz := clock_timestamp();
begin
  if p_user_id is null or p_action is null or p_action not in ('create','cancel') then
    raise exception 'Invalid order action.' using errcode='22023';
  end if;
  maximum := case when p_action='create' then 12 else 6 end;
  insert into ssupertea_private.order_action_limits as bucket(user_id,action,window_start,attempts)
    values(p_user_id,p_action,moment,1)
  on conflict(user_id,action) do update set
    attempts=case when bucket.window_start <= moment-interval '60 seconds' then 1 else least(bucket.attempts+1,maximum+1) end,
    window_start=case when bucket.window_start <= moment-interval '60 seconds' then moment else bucket.window_start end
  returning * into rate;
  return jsonb_build_object('allowed',rate.attempts<=maximum,'retry_after',greatest(1,ceil(extract(epoch from rate.window_start+interval '60 seconds'-moment))::integer));
end;
$function$;
revoke all on function public.consume_order_action(uuid,text) from public, anon, authenticated;
grant execute on function public.consume_order_action(uuid,text) to service_role;

create table public.order_events (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.orders(id),
  event_type text not null check (event_type in ('history_started','order_created','status_changed','order_updated','rider_assigned','rider_reassigned','assignment_updated')),
  occurred_at timestamptz not null default clock_timestamp(),
  actor_user_id uuid,
  actor_kind text not null check (actor_kind in ('customer','staff','system')),
  from_status text,
  to_status text,
  metadata jsonb not null default '{}'::jsonb
);
create index order_events_order_time_idx on public.order_events(order_id, occurred_at desc, id desc);
alter table public.order_events enable row level security;
revoke all on public.order_events from public, anon, authenticated, service_role;
revoke all on sequence public.order_events_id_seq from public, anon, authenticated, service_role;
grant select on public.order_events to authenticated;
create policy "Managers read order activity" on public.order_events for select to authenticated
  using ((select public.can_manage_orders()) and not coalesce((select (auth.jwt()->>'is_anonymous')::boolean), false));

-- Normal staff actions go through permission/state-checked RPCs. Clients cannot
-- bypass them to rewrite prices, ownership, history or terminal status.
revoke insert, update, delete on public.orders from authenticated, anon;
drop policy if exists "Store admins can manage all orders" on public.orders;
create policy "Store admins can read all orders" on public.orders for select to authenticated
  using ((select public.can_manage_orders()) and not coalesce((select (auth.jwt()->>'is_anonymous')::boolean), false));

create function ssupertea_private.record_order_activity() returns trigger
language plpgsql security definer set search_path = '' as $function$
declare
  actor uuid := auth.uid();
  actor_kind text := 'system';
  event_type text;
  previous_status text;
  next_status text;
  event_order uuid;
  details jsonb := '{}'::jsonb;
begin
  if actor is not null then
    actor_kind := case when exists(select 1 from public.staff_users s where s.user_id=actor and s.active and (s.can_manage_orders or s.can_deliver_orders)) then 'staff' else 'customer' end;
  elsif tg_table_name='orders' and tg_op='INSERT' then
    -- Browser INSERT is revoked. Checkout's trusted backend supplies this owner.
    actor := new.customer_session_token; actor_kind := 'customer';
  elsif nullif(current_setting('ssupertea.audit_customer_id', true), '') is not null then
    -- Set only inside the service-role-only cancellation RPC below.
    actor := current_setting('ssupertea.audit_customer_id', true)::uuid; actor_kind := 'customer';
  end if;
  if tg_table_name='orders' then
    event_order := new.id; next_status := new.status;
    if tg_op='INSERT' then event_type := 'order_created';
    else
      if new is not distinct from old then return new; end if;
      previous_status := old.status;
      event_type := case when new.status is distinct from old.status then 'status_changed' else 'order_updated' end;
      select jsonb_build_object('changed_fields',jsonb_agg(k.key order by k.key)) into details
      from jsonb_each(to_jsonb(new)) k where k.key <> 'request_fingerprint' and k.value is distinct from to_jsonb(old)->k.key;
    end if;
  else
    event_order := new.order_id;
    if tg_op='INSERT' then event_type := 'rider_assigned';
    else
      if new is not distinct from old then return new; end if;
      event_type := case when new.rider_user_id is distinct from old.rider_user_id then 'rider_reassigned' else 'assignment_updated' end;
    end if;
    details := jsonb_build_object('rider_user_id',new.rider_user_id);
    if tg_op='UPDATE' then details := details || jsonb_build_object('previous_rider_user_id',old.rider_user_id); end if;
  end if;
  insert into public.order_events(order_id,event_type,actor_user_id,actor_kind,from_status,to_status,metadata)
    values(event_order,event_type,actor,actor_kind,previous_status,next_status,coalesce(details,'{}'::jsonb));
  return new;
end;
$function$;
revoke all on function ssupertea_private.record_order_activity() from public, anon, authenticated, service_role;
create trigger order_activity_recorded after insert or update on public.orders
  for each row execute function ssupertea_private.record_order_activity();
create trigger assignment_activity_recorded after insert or update on public.order_delivery_assignments
  for each row execute function ssupertea_private.record_order_activity();

create or replace function public.cancel_customer_order(p_order_id uuid,p_customer_user_id uuid)
returns setof public.orders language plpgsql security definer set search_path = '' as $function$
declare v_order public.orders%rowtype;
begin
  select * into v_order from public.orders
    where id=p_order_id and customer_session_token=p_customer_user_id for update;
  if not found then raise exception 'Order not found or owner mismatch.'; end if;
  if v_order.status='cancelled' then return next v_order; return; end if;
  if v_order.status <> 'pending' then raise exception 'Order cancellation locked. Current status: %',v_order.status; end if;
  if now() < v_order.created_at + interval '10 minutes' then
    raise exception 'Order cancellation waiting period is still active. Cancellation is available after 10 minutes.';
  end if;
  perform set_config('ssupertea.audit_customer_id',p_customer_user_id::text,true);
  return query update public.orders set status='cancelled' where id=p_order_id and status='pending' returning *;
  perform set_config('ssupertea.audit_customer_id','',true);
end;
$function$;
revoke all on function public.cancel_customer_order(uuid,uuid) from public, anon, authenticated;
grant execute on function public.cancel_customer_order(uuid,uuid) to service_role;

insert into public.order_events(order_id,event_type,actor_kind,to_status,metadata)
  select id,'history_started','system',status,'{"note":"Detailed activity logging starts here; earlier actions were not recorded."}'::jsonb from public.orders;
