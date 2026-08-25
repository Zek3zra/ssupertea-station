-- Ssupertea Station — Phase 8A Rider Core verification
-- Read-only checks to run after PHASE_8_RIDER_CORE.sql.

-- 1. Confirm the rider order policy exists.
select
  schemaname,
  tablename,
  policyname,
  cmd,
  roles,
  qual
from pg_policies
where
  schemaname = 'public'
  and tablename = 'orders'
  and policyname = 'Riders can read assigned delivery orders';

-- 2. Confirm the four Phase 8A RPCs exist and are SECURITY DEFINER.
select
  p.proname,
  pg_get_function_identity_arguments(p.oid) as arguments,
  p.prosecdef as security_definer,
  p.provolatile as volatility
from pg_proc p
join pg_namespace n
  on n.oid = p.pronamespace
where
  n.nspname = 'public'
  and p.proname in (
    'rider_start_delivery',
    'rider_complete_delivery',
    'admin_mark_pickup_ready',
    'admin_complete_pickup_order'
  )
order by p.proname;

-- 3. anon must not have EXECUTE. authenticated should have EXECUTE.
select
  grantee,
  routine_name,
  privilege_type
from information_schema.routine_privileges
where
  specific_schema = 'public'
  and routine_name in (
    'rider_start_delivery',
    'rider_complete_delivery',
    'admin_mark_pickup_ready',
    'admin_complete_pickup_order'
  )
order by routine_name, grantee;

-- 4. Realtime dependencies from prior phases should still be present.
select
  schemaname,
  tablename
from pg_catalog.pg_publication_tables
where
  pubname = 'supabase_realtime'
  and schemaname = 'public'
  and tablename in (
    'orders',
    'order_delivery_assignments'
  )
order by tablename;

-- 5. Existing assignment table remains RLS protected.
select
  c.relname as table_name,
  c.relrowsecurity as rls_enabled
from pg_class c
join pg_namespace n
  on n.oid = c.relnamespace
where
  n.nspname = 'public'
  and c.relname in (
    'orders',
    'order_delivery_assignments'
  )
order by c.relname;
