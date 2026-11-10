-- Rollback-only verification. Never enrolls a real factor or changes passwords.
begin;
do $test$
declare
  manager_id uuid;
  rider_id uuid;
  customer_id uuid;
  sample_order uuid;
  result jsonb;
  failed boolean;
begin
  select user_id into manager_id from public.staff_users where active and can_manage_orders limit 1;
  select user_id into rider_id from public.staff_users where active and can_deliver_orders limit 1;
  select id into customer_id from auth.users u where not coalesce(u.is_anonymous,false)
    and not exists(select 1 from public.staff_users s where s.user_id=u.id and s.active) limit 1;
  select id into sample_order from public.orders where customer_session_token is distinct from manager_id limit 1;
  assert manager_id is not null and rider_id is not null and customer_id is not null and sample_order is not null,'Existing staff, customer and order are required.';

  update ssupertea_private.security_settings set require_staff_mfa=true where singleton;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',manager_id,'role','authenticated','is_anonymous',false,'aal','aal1')::text,true);
  execute 'set local role authenticated';
  assert not public.can_manage_orders() and not public.is_staff(),'A password-only session must not get staff access when MFA is enabled.';
  result:=public.get_my_staff_permissions();
  assert (result->>'active')::boolean and (result->>'can_manage_orders')::boolean and (result->>'mfa_required')::boolean,'Own staff role must still be discoverable for enrollment.';
  assert (select count(*)=0 from public.orders where id=sample_order),'aal1 must not read another customer order.';
  assert (select count(*)=0 from public.order_events),'aal1 must not read private activity.';
  assert (select count(*)>0 from public.menu_catalog),'Public menu must stay available.';
  failed:=false;
  begin perform public.admin_confirm_order(sample_order); exception when insufficient_privilege then failed:=true; end;
  assert failed,'aal1 must not call staff mutation RPCs.';
  failed:=false;
  begin update ssupertea_private.security_settings set require_staff_mfa=false; exception when insufficient_privilege then failed:=true; end;
  assert failed,'Staff clients must not disable MFA enforcement.';
  execute 'reset role';

  perform set_config('request.jwt.claims',jsonb_build_object('sub',manager_id,'role','authenticated','is_anonymous',false,'aal','aal2')::text,true);
  execute 'set local role authenticated';
  assert public.can_manage_orders() and public.is_staff(),'Verified manager must retain access.';
  assert (select count(*)>0 from public.order_events),'Verified manager must see activity.';
  execute 'reset role';

  perform set_config('request.jwt.claims',jsonb_build_object('sub',rider_id,'role','authenticated','is_anonymous',false,'aal','aal1')::text,true);
  execute 'set local role authenticated';
  assert not public.can_deliver_orders(),'Password-only rider must be restricted.';
  execute 'reset role';
  perform set_config('request.jwt.claims',jsonb_build_object('sub',rider_id,'role','authenticated','is_anonymous',false,'aal','aal2')::text,true);
  execute 'set local role authenticated';
  assert public.can_deliver_orders(),'Verified rider must retain delivery access.';
  execute 'reset role';

  perform set_config('request.jwt.claims',jsonb_build_object('sub',customer_id,'role','authenticated','is_anonymous',false,'aal','aal2')::text,true);
  execute 'set local role authenticated';
  assert not public.is_staff(),'MFA alone must never grant a customer staff permissions.';
  assert (select count(*)>0 from public.menu_catalog),'Customer menu must remain available.';
  execute 'reset role';

  update ssupertea_private.security_settings set require_staff_mfa=false where singleton;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',manager_id,'role','authenticated','is_anonymous',false,'aal','aal1')::text,true);
  execute 'set local role authenticated';
  assert public.can_manage_orders(),'Disabled rollout must preserve current deployed staff access.';
  execute 'reset role';
  assert not has_function_privilege('authenticated','ssupertea_private.staff_mfa_satisfied()','execute'),'Private enforcement helper must not be callable by clients.';
end;
$test$;
rollback;
select 'PASS: staged MFA, aal1 staff data/action denial, aal2 permissions, enrollment discovery, customer menu, private settings, existing staff compatibility' as verification;
