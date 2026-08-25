-- Ssupertea Station — Phase 8A Rider Core
-- Commit this migration with the Rider Mode frontend, but run it in Supabase
-- only after reviewing and approving the database change.
--
-- Adds:
--   1. Rider SELECT access to only orders assigned to the current rider
--   2. Rider RPC: preparing delivery -> dispatched
--   3. Rider RPC: dispatched delivery -> completed
--   4. Admin RPC: preparing pickup -> dispatched (Ready for pickup)
--   5. Admin RPC: dispatched pickup -> completed
--
-- No GPS/location table is added in Phase 8A.

begin;

-- Riders may read only delivery orders assigned to their own authenticated
-- account. Existing customer ownership and admin policies remain unchanged.
drop policy if exists
  "Riders can read assigned delivery orders"
  on public.orders;

create policy
  "Riders can read assigned delivery orders"
  on public.orders
  for select
  to authenticated
  using (
    order_type = 'delivery'
    and public.can_deliver_orders()
    and exists (
      select 1
      from public.order_delivery_assignments as assignment
      where
        assignment.order_id = orders.id
        and assignment.rider_user_id = auth.uid()
    )
  );

create or replace function public.rider_start_delivery(
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
      message = 'Only delivery orders can be started by a rider.';
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

  if v_order.status <> 'preparing' then
    raise exception using
      errcode = 'P0001',
      message = 'Only a preparing delivery can be started.';
  end if;

  update public.orders
  set status = 'dispatched'
  where id = p_order_id
  returning * into v_order;

  return to_jsonb(v_order);
end;
$$;

revoke all on function public.rider_start_delivery(uuid) from public;
revoke execute on function public.rider_start_delivery(uuid) from anon;
grant execute on function public.rider_start_delivery(uuid) to authenticated;

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

  return to_jsonb(v_order);
end;
$$;

revoke all on function public.rider_complete_delivery(uuid) from public;
revoke execute on function public.rider_complete_delivery(uuid) from anon;
grant execute on function public.rider_complete_delivery(uuid) to authenticated;

create or replace function public.admin_mark_pickup_ready(
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
  if not public.can_manage_orders() then
    raise exception using
      errcode = '42501',
      message = 'Store admin permission required.';
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

  if v_order.order_type <> 'pickup' then
    raise exception using
      errcode = 'P0001',
      message = 'Only pickup orders can be marked ready for pickup.';
  end if;

  if v_order.status <> 'preparing' then
    raise exception using
      errcode = 'P0001',
      message = 'Only a preparing pickup can be marked ready.';
  end if;

  update public.orders
  set status = 'dispatched'
  where id = p_order_id
  returning * into v_order;

  return to_jsonb(v_order);
end;
$$;

revoke all on function public.admin_mark_pickup_ready(uuid) from public;
revoke execute on function public.admin_mark_pickup_ready(uuid) from anon;
grant execute on function public.admin_mark_pickup_ready(uuid) to authenticated;

create or replace function public.admin_complete_pickup_order(
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
  if not public.can_manage_orders() then
    raise exception using
      errcode = '42501',
      message = 'Store admin permission required.';
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

  if v_order.order_type <> 'pickup' then
    raise exception using
      errcode = 'P0001',
      message = 'Only pickup orders can be completed with this action.';
  end if;

  if v_order.status <> 'dispatched' then
    raise exception using
      errcode = 'P0001',
      message = 'Only a pickup that is ready can be completed.';
  end if;

  update public.orders
  set status = 'completed'
  where id = p_order_id
  returning * into v_order;

  return to_jsonb(v_order);
end;
$$;

revoke all on function public.admin_complete_pickup_order(uuid) from public;
revoke execute on function public.admin_complete_pickup_order(uuid) from anon;
grant execute on function public.admin_complete_pickup_order(uuid) to authenticated;

commit;
