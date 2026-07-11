select
    id,
    customer_name,
    order_type,
    items_subtotal,
    delivery_fee,
    total_price,
    route_distance_m,
    route_duration_s,
    status,
    created_at
from public.orders
order by created_at desc
limit 20;

select
    policyname,
    cmd,
    roles
from pg_policies
where schemaname = 'public'
  and tablename = 'orders'
order by policyname;

select
    pubname,
    schemaname,
    tablename
from pg_publication_tables
where pubname = 'supabase_realtime'
  and schemaname = 'public'
  and tablename = 'orders';
