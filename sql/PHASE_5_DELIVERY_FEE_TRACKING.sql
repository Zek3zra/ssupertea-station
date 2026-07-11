begin;

-- =========================================================
-- SSUPERTEA STATION — PHASE 5
-- SECURE DELIVERY FEES + REALTIME TRACKING
--
-- Delivery fee:
--   Every started 300 meters of the ORS driving route = ₱10
--
-- Checkout now goes through /api/create-order using the service-role key.
-- Customers keep SELECT access only for their own order tracking.
-- =========================================================


-- =========================================================
-- 1. ORDER PRICE AND ROUTE COLUMNS
-- =========================================================

alter table public.orders
add column if not exists items_subtotal numeric(12, 2);

alter table public.orders
add column if not exists delivery_fee numeric(12, 2);

alter table public.orders
add column if not exists route_distance_m integer;

alter table public.orders
add column if not exists route_duration_s integer;

update public.orders
set
    items_subtotal = coalesce(
        items_subtotal,
        total_price
    ),
    delivery_fee = coalesce(
        delivery_fee,
        0
    )
where
    items_subtotal is null
    or delivery_fee is null;

alter table public.orders
alter column items_subtotal
set default 0;

alter table public.orders
alter column items_subtotal
set not null;

alter table public.orders
alter column delivery_fee
set default 0;

alter table public.orders
alter column delivery_fee
set not null;


-- =========================================================
-- 2. NEW-ROW CONSISTENCY CHECKS
-- Existing legacy rows are not scanned because the constraints are NOT VALID.
-- PostgreSQL still enforces them for every new or updated row.
-- =========================================================

alter table public.orders
drop constraint if exists orders_phase5_price_check;

alter table public.orders
add constraint orders_phase5_price_check
check (
    items_subtotal >= 0
    and delivery_fee >= 0
    and total_price = items_subtotal + delivery_fee
) not valid;

alter table public.orders
drop constraint if exists orders_phase5_route_fee_check;

alter table public.orders
add constraint orders_phase5_route_fee_check
check (
    (
        order_type = 'pickup'
        and delivery_fee = 0
        and route_distance_m is null
        and route_duration_s is null
    )
    or
    (
        order_type = 'delivery'
        and route_distance_m is not null
        and route_distance_m > 0
        and route_duration_s is not null
        and route_duration_s > 0
        and delivery_fee =
            ceil(route_distance_m::numeric / 300) * 10
    )
) not valid;


-- =========================================================
-- 3. CUSTOMERS CAN NO LONGER INSERT DIRECTLY
-- The secure Vercel endpoint inserts with service_role after:
--   - verifying the anonymous access token
--   - pricing items from public.menu_products/menu_addons
--   - calculating the ORS route
--   - calculating the delivery fee
-- =========================================================

drop policy if exists
"Customers can insert their own orders"
on public.orders;

revoke insert
on table public.orders
from authenticated;

grant select
on table public.orders
to authenticated;

grant update, delete
on table public.orders
to authenticated;

grant execute
on function public.price_customer_order(jsonb)
to service_role;


-- =========================================================
-- 4. CUSTOMER TRACKING POLICY
-- =========================================================

drop policy if exists
"Customers can read their own orders"
on public.orders;

create policy
"Customers can read their own orders"
on public.orders
for select
to authenticated
using (
    coalesce(
        (auth.jwt() ->> 'is_anonymous')::boolean,
        false
    ) = true
    and customer_session_token = auth.uid()
);


-- =========================================================
-- 5. STAFF MANAGEMENT POLICY
-- =========================================================

drop policy if exists
"Staff can manage all orders"
on public.orders;

create policy
"Staff can manage all orders"
on public.orders
for all
to authenticated
using (
    public.is_staff()
)
with check (
    public.is_staff()
);


-- =========================================================
-- 6. REALTIME
-- =========================================================

do $block$
begin
    if not exists (
        select 1
        from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = 'orders'
    ) then
        alter publication supabase_realtime
        add table public.orders;
    end if;
end;
$block$;


commit;


-- Optional after reviewing old rows:
--
-- alter table public.orders
-- validate constraint orders_phase5_price_check;
--
-- alter table public.orders
-- validate constraint orders_phase5_route_fee_check;
