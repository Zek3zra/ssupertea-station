-- Ssupertea Station — Phase 8B Live GPS
-- Commit with the Phase 8B frontend, but apply to Supabase only after review.
--
-- Adds:
--   1. One latest rider location row per delivery order
--   2. Strict RLS for assigned rider, owning customer, and store admin
--   3. Secure rider_update_delivery_location RPC
--   4. Automatic live-location cleanup when a rider completes delivery
--   5. Realtime publication for order_delivery_locations
--
-- This intentionally stores only the latest location, not a GPS history.

begin;

create table if not exists public.order_delivery_locations (
  order_id uuid primary key
    references public.orders(id)
    on delete cascade,
  rider_user_id uuid not null
    references auth.users(id)
    on delete cascade,
  latitude double precision not null,
  longitude double precision not null,
  accuracy_m double precision,
  updated_at timestamptz not null default now(),
  constraint order_delivery_locations_latitude_check
    check (latitude between -90 and 90),
  constraint order_delivery_locations_longitude_check
    check (longitude between -180 and 180),
  constraint order_delivery_locations_accuracy_check
    check (accuracy_m is null or (accuracy_m >= 0 and accuracy_m <= 5000))
);

create index if not exists order_delivery_locations_rider_idx
  on public.order_delivery_locations (rider_user_id);

create index if not exists order_delivery_locations_updated_idx
  on public.order_delivery_locations (updated_at desc);

alter table public.order_delivery_locations enable row level security;

revoke all on table public.order_delivery_locations from public;
revoke all on table public.order_delivery_locations from anon;
revoke all on table public.order_delivery_locations from authenticated;
grant select on table public.order_delivery_locations to authenticated;

drop policy if exists
  "Authorized users can read current delivery location"
  on public.order_delivery_locations;

create policy
  "Authorized users can read current delivery location"
  on public.order_delivery_locations
  for select
  to authenticated
  using (
    public.can_manage_orders()
    or (
      rider_user_id = auth.uid()
      and public.can_deliver_orders()
      and exists (
        select 1
        from public.order_delivery_assignments as assignment
        where
          assignment.order_id = order_delivery_locations.order_id
          and assignment.rider_user_id = auth.uid()
      )
    )
    or exists (
      select 1
      from public.orders as customer_order
      where
        customer_order.id = order_delivery_locations.order_id
        and customer_order.customer_session_token = auth.uid()
        and customer_order.order_type = 'delivery'
        and customer_order.status = 'dispatched'
    )
  );

create or replace function public.rider_update_delivery_location(
  p_order_id uuid,
  p_latitude double precision,
  p_longitude double precision,
  p_accuracy_m double precision default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_order public.orders%rowtype;
  v_existing public.order_delivery_locations%rowtype;
  v_location public.order_delivery_locations%rowtype;
begin
  if auth.uid() is null then
    raise exception using
      errcode = '42501',
      message = 'Authentication required.';
  end if;

  if not public.can_deliver_orders() then
    raise exception using
      errcode = '42501',
      message = 'Rider permission required.';
  end if;

  if p_latitude is null or not (p_latitude between -90 and 90) then
    raise exception using
      errcode = '22023',
      message = 'Latitude is invalid.';
  end if;

  if p_longitude is null or not (p_longitude between -180 and 180) then
    raise exception using
      errcode = '22023',
      message = 'Longitude is invalid.';
  end if;

  if p_accuracy_m is not null and not (p_accuracy_m between 0 and 5000) then
    raise exception using
      errcode = '22023',
      message = 'GPS accuracy is invalid.';
  end if;

  select *
  into v_order
  from public.orders
  where id = p_order_id
  for share;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'Order not found.';
  end if;

  if v_order.order_type <> 'delivery' then
    raise exception using
      errcode = 'P0001',
      message = 'Only delivery orders can share rider location.';
  end if;

  if v_order.status <> 'dispatched' then
    raise exception using
      errcode = 'P0001',
      message = 'Live location is allowed only while the order is out for delivery.';
  end if;

  if not exists (
    select 1
    from public.order_delivery_assignments
    where
      order_id = p_order_id
      and rider_user_id = auth.uid()
  ) then
    raise exception using
      errcode = '42501',
      message = 'This delivery is not assigned to your rider account.';
  end if;

  select *
  into v_existing
  from public.order_delivery_locations
  where order_id = p_order_id
  for update;

  -- Defense in depth against a modified client flooding the database.
  -- The frontend normally sends substantially less often than this.
  if found and now() - v_existing.updated_at < interval '2 seconds' then
    return to_jsonb(v_existing);
  end if;

  insert into public.order_delivery_locations (
    order_id,
    rider_user_id,
    latitude,
    longitude,
    accuracy_m,
    updated_at
  )
  values (
    p_order_id,
    auth.uid(),
    p_latitude,
    p_longitude,
    p_accuracy_m,
    now()
  )
  on conflict (order_id)
  do update set
    rider_user_id = excluded.rider_user_id,
    latitude = excluded.latitude,
    longitude = excluded.longitude,
    accuracy_m = excluded.accuracy_m,
    updated_at = excluded.updated_at
  returning * into v_location;

  return to_jsonb(v_location);
end;
$$;

revoke all on function public.rider_update_delivery_location(
  uuid,
  double precision,
  double precision,
  double precision
) from public;
revoke execute on function public.rider_update_delivery_location(
  uuid,
  double precision,
  double precision,
  double precision
) from anon;
grant execute on function public.rider_update_delivery_location(
  uuid,
  double precision,
  double precision,
  double precision
) to authenticated;

-- Preserve the Phase 8A permission checks and add privacy cleanup so a
-- completed delivery never leaves a stale live rider location behind.
create or replace function public.rider_complete_delivery(
  p_order_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_order public.orders%rowtype;
begin
  if not public.can_deliver_orders() then
    raise exception using
      errcode = '42501',
      message = 'Rider permission required.';
  end if;

  select *
  into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'Order not found.';
  end if;

  if v_order.order_type <> 'delivery' then
    raise exception using
      errcode = 'P0001',
      message = 'Only delivery orders can be completed by a rider.';
  end if;

  if not exists (
    select 1
    from public.order_delivery_assignments
    where
      order_id = p_order_id
      and rider_user_id = auth.uid()
  ) then
    raise exception using
      errcode = '42501',
      message = 'This delivery is not assigned to your rider account.';
  end if;

  if v_order.status <> 'dispatched' then
    raise exception using
      errcode = 'P0001',
      message = 'Only a dispatched delivery can be completed.';
  end if;

  update public.orders
  set status = 'completed'
  where id = p_order_id
  returning * into v_order;

  delete from public.order_delivery_locations
  where order_id = p_order_id;

  return to_jsonb(v_order);
end;
$$;

revoke all on function public.rider_complete_delivery(uuid) from public;
revoke execute on function public.rider_complete_delivery(uuid) from anon;
grant execute on function public.rider_complete_delivery(uuid) to authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_publication_tables
    where
      pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'order_delivery_locations'
  ) then
    alter publication supabase_realtime
      add table public.order_delivery_locations;
  end if;
end
$$;

commit;
