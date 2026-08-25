-- Ssupertea Station — Phase 8B Live GPS verification
-- Read-only checks only.

select
  n.nspname as table_schema,
  c.relname as table_name,
  c.relrowsecurity as row_security
from pg_catalog.pg_class c
join pg_catalog.pg_namespace n
  on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname = 'order_delivery_locations';

select
  column_name,
  data_type,
  is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'order_delivery_locations'
order by ordinal_position;

select
  policyname,
  cmd,
  roles,
  qual
from pg_catalog.pg_policies
where schemaname = 'public'
  and tablename = 'order_delivery_locations';

select
  p.proname,
  p.prosecdef as security_definer,
  p.proconfig as config
from pg_catalog.pg_proc p
join pg_catalog.pg_namespace n
  on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'rider_update_delivery_location',
    'rider_complete_delivery'
  )
order by p.proname;

select
  routine_name,
  grantee,
  privilege_type
from information_schema.routine_privileges
where routine_schema = 'public'
  and routine_name in (
    'rider_update_delivery_location',
    'rider_complete_delivery'
  )
order by routine_name, grantee;

select
  has_function_privilege(
    'anon',
    'public.rider_update_delivery_location(uuid,double precision,double precision,double precision)',
    'EXECUTE'
  ) as anon_can_update_location,
  has_function_privilege(
    'authenticated',
    'public.rider_update_delivery_location(uuid,double precision,double precision,double precision)',
    'EXECUTE'
  ) as authenticated_can_update_location;

select
  pubname,
  schemaname,
  tablename
from pg_catalog.pg_publication_tables
where pubname = 'supabase_realtime'
  and schemaname = 'public'
  and tablename = 'order_delivery_locations';

select
  order_id,
  rider_user_id,
  latitude,
  longitude,
  accuracy_m,
  updated_at
from public.order_delivery_locations
order by updated_at desc
limit 20;
