-- Run this after FINAL_DATABASE_SECURITY_REVIEW.sql.

select
    schemaname,
    tablename,
    policyname,
    cmd,
    roles
from pg_policies
where schemaname = 'public'
  and tablename in (
      'orders',
      'menu_products',
      'menu_addons',
      'staff_users'
  )
order by tablename, policyname;

select
    indexname,
    indexdef
from pg_indexes
where schemaname = 'public'
  and tablename = 'orders'
order by indexname;

select
    trigger_name,
    event_manipulation,
    action_timing
from information_schema.triggers
where event_object_schema = 'public'
  and event_object_table = 'orders'
order by trigger_name;
