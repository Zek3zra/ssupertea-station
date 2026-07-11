begin;

-- =========================================================
-- SSUPERTEA STATION
-- FINAL DATABASE SECURITY + RLS REVIEW
--
-- Safe to run after the supplied tables already exist.
-- This script:
--   - adds delivery consistency constraints and indexes
--   - adds the explicit staff allowlist
--   - restores secure RLS policies
--   - validates and prices customer carts on the server
--   - protects customer-owned orders
-- =========================================================


-- =========================================================
-- 1. TABLE CONSTRAINTS AND INDEXES
-- =========================================================

do $block$
begin
    if not exists (
        select 1
        from pg_constraint
        where conname = 'orders_delivery_details_check'
          and conrelid = 'public.orders'::regclass
    ) then
        alter table public.orders
        add constraint orders_delivery_details_check
        check (
            (
                order_type = 'pickup'
                and delivery_address is null
                and delivery_lat is null
                and delivery_lng is null
            )
            or
            (
                order_type = 'delivery'
                and delivery_address is not null
                and char_length(btrim(delivery_address)) between 5 and 500
                and delivery_lat between -90 and 90
                and delivery_lng between -180 and 180
            )
        ) not valid;
    end if;

    if not exists (
        select 1
        from pg_constraint
        where conname = 'orders_total_price_upper_bound_check'
          and conrelid = 'public.orders'::regclass
    ) then
        alter table public.orders
        add constraint orders_total_price_upper_bound_check
        check (total_price <= 1000000) not valid;
    end if;
end;
$block$;

create index if not exists orders_customer_session_token_idx
on public.orders (customer_session_token);

create index if not exists orders_created_at_desc_idx
on public.orders (created_at desc);

create index if not exists orders_status_created_at_idx
on public.orders (status, created_at desc);

create index if not exists orders_active_status_idx
on public.orders (created_at desc)
where status in ('pending', 'preparing', 'dispatched');

alter table public.staff_users
drop constraint if exists staff_users_user_id_fkey;

alter table public.staff_users
add constraint staff_users_user_id_fkey
foreign key (user_id)
references auth.users(id)
on delete cascade;


-- =========================================================
-- 2. EXPLICIT STAFF CHECK
-- =========================================================

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
    select exists (
        select 1
        from public.staff_users as staff
        where staff.user_id = auth.uid()
    );
$function$;

revoke all
on function public.is_staff()
from public;

grant execute
on function public.is_staff()
to authenticated;


-- =========================================================
-- 3. SERVER-SIDE MENU PRICE VALIDATION
-- =========================================================

create or replace function public.price_customer_order(
    raw_items jsonb
)
returns jsonb
language plpgsql
stable
set search_path = ''
as $function$
declare
    raw_item jsonb;
    product_row record;
    addon_row record;

    product_id_value text;
    size_id_value text;
    size_label_value text;
    size_surcharge numeric(12, 2);

    sugar_id_value text;
    sugar_label_value text;

    ice_id_value text;
    ice_label_value text;

    quantity_value integer;
    raw_addons jsonb;
    addon_id_value text;
    seen_addon_ids text[];

    normalized_items jsonb := '[]'::jsonb;
    normalized_addons jsonb;

    addon_total numeric(12, 2);
    unit_price_value numeric(12, 2);
    line_total_value numeric(12, 2);
    order_total_value numeric(12, 2) := 0;
begin
    if jsonb_typeof(raw_items) is distinct from 'array' then
        raise exception using
            errcode = '22023',
            message = 'Order items must be a JSON array.';
    end if;

    if jsonb_array_length(raw_items) < 1 then
        raise exception using
            errcode = '22023',
            message = 'An order must contain at least one item.';
    end if;

    if jsonb_array_length(raw_items) > 50 then
        raise exception using
            errcode = '22023',
            message = 'An order cannot contain more than 50 customized lines.';
    end if;

    for raw_item in
        select value
        from jsonb_array_elements(raw_items)
    loop
        if jsonb_typeof(raw_item) is distinct from 'object' then
            raise exception using
                errcode = '22023',
                message = 'Every order item must be a JSON object.';
        end if;

        product_id_value :=
            btrim(coalesce(raw_item ->> 'product_id', ''));

        select
            product.id,
            product.name,
            product.category,
            product.base_price
        into product_row
        from public.menu_products as product
        where product.id = product_id_value
          and product.active = true;

        if not found then
            raise exception using
                errcode = '22023',
                message = format(
                    'The menu product "%s" is invalid or unavailable.',
                    product_id_value
                );
        end if;

        begin
            quantity_value :=
                (raw_item ->> 'quantity')::integer;
        exception
            when invalid_text_representation
              or numeric_value_out_of_range
            then
                raise exception using
                    errcode = '22023',
                    message =
                        'Every order quantity must be a whole number.';
        end;

        if quantity_value < 1 or quantity_value > 20 then
            raise exception using
                errcode = '22023',
                message =
                    'Every customized item quantity must be between 1 and 20.';
        end if;

        size_id_value :=
            btrim(coalesce(raw_item ->> 'size_id', ''));

        case size_id_value
            when 'medium' then
                size_label_value := 'Medium';
                size_surcharge := 0;
            when 'large' then
                size_label_value := 'Large';
                size_surcharge := 15;
            else
                raise exception using
                    errcode = '22023',
                    message =
                        'An order item contains an invalid size.';
        end case;

        sugar_id_value :=
            btrim(coalesce(raw_item ->> 'sugar_id', ''));

        case sugar_id_value
            when '0' then sugar_label_value := '0%';
            when '25' then sugar_label_value := '25%';
            when '50' then sugar_label_value := '50%';
            when '75' then sugar_label_value := '75%';
            when '100' then sugar_label_value := '100%';
            else
                raise exception using
                    errcode = '22023',
                    message =
                        'An order item contains an invalid sugar level.';
        end case;

        ice_id_value :=
            btrim(coalesce(raw_item ->> 'ice_id', ''));

        case ice_id_value
            when 'no-ice' then ice_label_value := 'No ice';
            when 'less-ice' then ice_label_value := 'Less';
            when 'regular-ice' then ice_label_value := 'Regular';
            when 'extra-ice' then ice_label_value := 'Extra';
            else
                raise exception using
                    errcode = '22023',
                    message =
                        'An order item contains an invalid ice level.';
        end case;

        raw_addons :=
            coalesce(raw_item -> 'addon_ids', '[]'::jsonb);

        if jsonb_typeof(raw_addons) is distinct from 'array' then
            raise exception using
                errcode = '22023',
                message = 'Order add-ons must be a JSON array.';
        end if;

        if jsonb_array_length(raw_addons) > 4 then
            raise exception using
                errcode = '22023',
                message =
                    'An order item contains too many add-ons.';
        end if;

        normalized_addons := '[]'::jsonb;
        addon_total := 0;
        seen_addon_ids := array[]::text[];

        for addon_id_value in
            select value
            from jsonb_array_elements_text(raw_addons)
        loop
            addon_id_value := btrim(addon_id_value);

            if addon_id_value = any(seen_addon_ids) then
                raise exception using
                    errcode = '22023',
                    message = format(
                        'The add-on "%s" was submitted more than once.',
                        addon_id_value
                    );
            end if;

            select
                addon.id,
                addon.name,
                addon.price
            into addon_row
            from public.menu_addons as addon
            where addon.id = addon_id_value
              and addon.active = true;

            if not found then
                raise exception using
                    errcode = '22023',
                    message = format(
                        'The add-on "%s" is invalid or unavailable.',
                        addon_id_value
                    );
            end if;

            seen_addon_ids :=
                array_append(seen_addon_ids, addon_row.id);

            addon_total :=
                addon_total + addon_row.price;

            normalized_addons :=
                normalized_addons
                || jsonb_build_array(
                    jsonb_build_object(
                        'id', addon_row.id,
                        'label', addon_row.name,
                        'price', round(addon_row.price, 2)
                    )
                );
        end loop;

        unit_price_value := round(
            product_row.base_price
            + size_surcharge
            + addon_total,
            2
        );

        line_total_value := round(
            unit_price_value * quantity_value,
            2
        );

        order_total_value :=
            order_total_value + line_total_value;

        normalized_items :=
            normalized_items
            || jsonb_build_array(
                jsonb_build_object(
                    'product_id', product_row.id,
                    'name', product_row.name,
                    'category', product_row.category,
                    'size', jsonb_build_object(
                        'id', size_id_value,
                        'label', size_label_value,
                        'surcharge', round(size_surcharge, 2)
                    ),
                    'sugar', jsonb_build_object(
                        'id', sugar_id_value,
                        'label', sugar_label_value
                    ),
                    'ice', jsonb_build_object(
                        'id', ice_id_value,
                        'label', ice_label_value
                    ),
                    'addons', normalized_addons,
                    'unit_price', unit_price_value,
                    'quantity', quantity_value,
                    'line_total', line_total_value
                )
            );
    end loop;

    if order_total_value <= 0
       or order_total_value > 1000000 then
        raise exception using
            errcode = '22023',
            message =
                'The calculated order total is outside the allowed range.';
    end if;

    return jsonb_build_object(
        'items', normalized_items,
        'total_price', round(order_total_value, 2)
    );
end;
$function$;

revoke all
on function public.price_customer_order(jsonb)
from public;

grant execute
on function public.price_customer_order(jsonb)
to authenticated;


-- =========================================================
-- 4. CUSTOMER INSERT PROTECTION
-- =========================================================

create or replace function public.protect_customer_order_insert()
returns trigger
language plpgsql
set search_path = ''
as $function$
declare
    priced_order jsonb;
begin
    if coalesce(
        (auth.jwt() ->> 'is_anonymous')::boolean,
        false
    ) = true then
        if auth.uid() is null then
            raise exception using
                errcode = '42501',
                message =
                    'A valid customer session is required.';
        end if;

        new.customer_name := btrim(new.customer_name);
        new.customer_session_token := auth.uid();
        new.status := 'pending';
        new.created_at := pg_catalog.now();

        new.id := coalesce(
            new.id,
            pg_catalog.gen_random_uuid()
        );

        priced_order :=
            public.price_customer_order(new.items);

        new.items := priced_order -> 'items';
        new.total_price :=
            (priced_order ->> 'total_price')::numeric;

        if new.order_type = 'pickup' then
            new.delivery_address := null;
            new.delivery_lat := null;
            new.delivery_lng := null;
        elsif new.order_type = 'delivery' then
            new.delivery_address :=
                btrim(new.delivery_address);
        end if;
    end if;

    return new;
end;
$function$;

revoke all
on function public.protect_customer_order_insert()
from public;

drop trigger if exists protect_customer_order_insert_trigger
on public.orders;

create trigger protect_customer_order_insert_trigger
before insert on public.orders
for each row
execute function public.protect_customer_order_insert();


-- =========================================================
-- 5. ROW LEVEL SECURITY
-- =========================================================

alter table public.orders enable row level security;
alter table public.menu_products enable row level security;
alter table public.menu_addons enable row level security;
alter table public.staff_users enable row level security;

revoke all privileges
on table public.orders
from anon;

revoke all privileges
on table public.menu_products
from anon;

revoke all privileges
on table public.menu_addons
from anon;

revoke all privileges
on table public.staff_users
from anon, authenticated;

revoke all privileges
on table public.orders
from authenticated;

revoke all privileges
on table public.menu_products
from authenticated;

revoke all privileges
on table public.menu_addons
from authenticated;

grant select, insert, update, delete
on table public.orders
to authenticated;

grant select, insert, update, delete
on table public.menu_products
to authenticated;

grant select, insert, update, delete
on table public.menu_addons
to authenticated;

drop policy if exists "Customers can insert their own orders"
on public.orders;

drop policy if exists "Customers can read their own orders"
on public.orders;

drop policy if exists "Staff can manage all orders"
on public.orders;

create policy "Customers can insert their own orders"
on public.orders
for insert
to authenticated
with check (
    coalesce(
        (auth.jwt() ->> 'is_anonymous')::boolean,
        false
    ) = true
    and customer_session_token = auth.uid()
    and status = 'pending'
);

create policy "Customers can read their own orders"
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

create policy "Staff can manage all orders"
on public.orders
for all
to authenticated
using (public.is_staff())
with check (public.is_staff());

drop policy if exists "Customers can read active menu products"
on public.menu_products;

drop policy if exists "Staff can manage menu products"
on public.menu_products;

create policy "Customers can read active menu products"
on public.menu_products
for select
to authenticated
using (
    active = true
    or public.is_staff()
);

create policy "Staff can manage menu products"
on public.menu_products
for all
to authenticated
using (public.is_staff())
with check (public.is_staff());

drop policy if exists "Customers can read active menu addons"
on public.menu_addons;

drop policy if exists "Staff can manage menu addons"
on public.menu_addons;

create policy "Customers can read active menu addons"
on public.menu_addons
for select
to authenticated
using (
    active = true
    or public.is_staff()
);

create policy "Staff can manage menu addons"
on public.menu_addons
for all
to authenticated
using (public.is_staff())
with check (public.is_staff());


-- =========================================================
-- 6. REALTIME PUBLICATION
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


-- =========================================================
-- OPTIONAL VALIDATION AFTER EXISTING INVALID ROWS ARE FIXED
-- =========================================================
--
-- alter table public.orders
-- validate constraint orders_delivery_details_check;
--
-- alter table public.orders
-- validate constraint orders_total_price_upper_bound_check;
--
--
-- ADD A MANUALLY CREATED STAFF USER:
--
-- insert into public.staff_users (user_id)
-- select id
-- from auth.users
-- where lower(email) = lower('staff@example.com')
-- on conflict (user_id) do nothing;
-- =========================================================
