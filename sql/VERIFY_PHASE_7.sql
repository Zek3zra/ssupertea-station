-- Ssupertea Station — Phase 7 verification
-- Run after PHASE_7_ADMIN_ORDERS.sql.

-- 1. confirmed_at must exist.
select
  table_schema,
  table_name,
  column_name,
  data_type
from information_schema.columns
where
  table_schema = 'public'
  and table_name = 'orders'
  and column_name = 'confirmed_at';

-- 2. Assignment table must have RLS enabled.
select
  c.relname as table_name,
  c.relrowsecurity as rls_enabled
from pg_catalog.pg_class as c
join pg_catalog.pg_namespace as n
  on n.oid = c.relnamespace
where
  n.nspname = 'public'
  and c.relname = 'order_delivery_assignments';

-- 3. Expected assignment policies.
select
  schemaname,
  tablename,
  policyname,
  cmd,
  roles
from pg_catalog.pg_policies
where
  schemaname = 'public'
  and tablename = 'order_delivery_assignments'
order by policyname;

-- 4. Phase 7 RPC functions.
select
  n.nspname as schema_name,
  p.proname as function_name
from pg_catalog.pg_proc as p
join pg_catalog.pg_namespace as n
  on n.oid = p.pronamespace
where
  n.nspname = 'public'
  and p.proname in (
    'admin_list_delivery_staff',
    'admin_confirm_order',
    'admin_assign_rider'
  )
order by p.proname;

-- 5. Realtime publication should contain both tables.
select
  pubname,
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
