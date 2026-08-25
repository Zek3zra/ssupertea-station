-- Ssupertea Station — Phase 7 Admin Order Dashboard
-- Run this in Supabase SQL Editor before deploying the Phase 7 frontend.
--
-- Adds:
--   1. confirmed_at on orders
--   2. private rider assignment table
--   3. admin-only RPC to confirm pending orders
--   4. admin-only RPC to assign/reassign delivery riders
--   5. admin-only RPC to list active delivery staff
--
-- Security design:
--   - customer order ownership/RLS remains unchanged
--   - rider auth UUIDs are kept out of public.orders
--   - customers cannot read rider assignments
--   - admins can read assignments
--   - riders can read only their own assignments (used later by Rider Mode)
--   - all writes to assignments go through permission-checked RPCs

begin;

alter table public.orders
  add column if not exists confirmed_at timestamptz;

create index if not exists orders_status_created_at_idx
  on public.orders (status, created_at desc);

create table if not exists public.order_delivery_assignments (
  order_id uuid primary key
    references public.orders(id)
    on delete cascade,
  rider_user_id uuid not null
    references auth.users(id)
    on delete restrict,
  assigned_by uuid not null
    references auth.users(id)
    on delete restrict,
  assigned_at timestamptz not null default now()
);

create index if not exists order_delivery_assignments_rider_idx
  on public.order_delivery_assignments (rider_user_id, assigned_at desc);

alter table public.order_delivery_assignments enable row level security;

revoke all on table public.order_delivery_assignments from anon;
revoke all on table public.order_delivery_assignments from authenticated;
grant select on table public.order_delivery_assignments to authenticated;

drop policy if exists
  "Store admins can read delivery assignments"
  on public.order_delivery_assignments;

create policy
  "Store admins can read delivery assignments"
  on public.order_delivery_assignments
  for select
  to authenticated
  using (public.can_manage_orders());

drop policy if exists
  "Riders can read own delivery assignments"
  on public.order_delivery_assignments;

create policy
  "Riders can read own delivery assignments"
  on public.order_delivery_assignments
  for select
  to authenticated
  using (
    rider_user_id = auth.uid()
    and public.can_deliver_orders()
  );

create or replace function public.admin_list_delivery_staff()
returns table (
  user_id uuid,
  email text,
  display_name text,
  is_current_user boolean
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
begin
  if not public.can_manage_orders() then
    raise exception using
      errcode = '42501',
      message = 'Store admin permission required.';
  end if;

  return query
  select
    s.user_id,
    u.email::text,
    coalesce(
      nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''),
      nullif(btrim(u.raw_user_meta_data ->> 'name'), ''),
      split_part(u.email::text, '@', 1),
      'Rider'
    )::text as display_name,
    (s.user_id = auth.uid()) as is_current_user
  from public.staff_users as s
  join auth.users as u
    on u.id = s.user_id
  where
    s.active = true
    and s.can_deliver_orders = true
  order by
    (s.user_id = auth.uid()) desc,
    3 asc,
    u.email asc;
end;
$$;

revoke all on function public.admin_list_delivery_staff() from public;
grant execute on function public.admin_list_delivery_staff() to authenticated;

create or replace function public.admin_confirm_order(
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

  update public.orders
  set
    status = 'preparing',
    confirmed_at = coalesce(confirmed_at, now())
  where
    id = p_order_id
    and status = 'pending'
  returning * into v_order;

  if not found then
    if not exists (
      select 1
      from public.orders
      where id = p_order_id
    ) then
      raise exception using
        errcode = 'P0001',
        message = 'Order not found.';
    end if;

    raise exception using
      errcode = 'P0001',
      message = 'Only pending orders can be confirmed.';
  end if;

  return to_jsonb(v_order);
end;
$$;

revoke all on function public.admin_confirm_order(uuid) from public;
grant execute on function public.admin_confirm_order(uuid) to authenticated;

create or replace function public.admin_assign_rider(
  p_order_id uuid,
  p_rider_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_order public.orders%rowtype;
  v_assignment public.order_delivery_assignments%rowtype;
begin
  if not public.can_manage_orders() then
    raise exception using
      errcode = '42501',
      message = 'Store admin permission required.';
  end if;

  if not exists (
    select 1
    from public.staff_users
    where
      user_id = p_rider_user_id
      and active = true
      and can_deliver_orders = true
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'The selected account is not an active rider.';
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
      message = 'Pickup orders do not require a rider.';
  end if;

  if v_order.status <> 'preparing' then
    raise exception using
      errcode = 'P0001',
      message = 'A rider can be assigned only while the order is preparing.';
  end if;

  insert into public.order_delivery_assignments (
    order_id,
    rider_user_id,
    assigned_by,
    assigned_at
  )
  values (
    p_order_id,
    p_rider_user_id,
    auth.uid(),
    now()
  )
  on conflict (order_id)
  do update set
    rider_user_id = excluded.rider_user_id,
    assigned_by = excluded.assigned_by,
    assigned_at = excluded.assigned_at
  returning * into v_assignment;

  return to_jsonb(v_assignment);
end;
$$;

revoke all on function public.admin_assign_rider(uuid, uuid) from public;
grant execute on function public.admin_assign_rider(uuid, uuid) to authenticated;

-- Keep orders in Supabase Realtime. Phase 5 normally added this already,
-- but this guard makes Phase 7 safe to run on projects where it was omitted.
do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_publication_tables
    where
      pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'orders'
  ) then
    alter publication supabase_realtime add table public.orders;
  end if;
end;
$$;

-- Assignment changes are useful to the admin dashboard and later Rider Mode.
do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_publication_tables
    where
      pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'order_delivery_assignments'
  ) then
    alter publication supabase_realtime
      add table public.order_delivery_assignments;
  end if;
end;
$$;

commit;
