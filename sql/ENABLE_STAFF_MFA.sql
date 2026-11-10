-- FINAL OWNER ACTION ONLY, after deploying staff-security.html and enrolling
-- every active staff member. Run in the trusted Supabase SQL editor.
-- Do not run as part of the default setup migration.
begin;
do $$
begin
  assert exists(select 1 from public.staff_users where active and can_manage_orders), 'At least one active manager is required.';
  assert not exists (
    select 1 from public.staff_users s where s.active and (s.can_manage_orders or s.can_deliver_orders)
      and not exists(select 1 from auth.mfa_factors f where f.user_id=s.user_id and f.factor_type='totp' and f.status='verified')
  ), 'Enroll and verify an authenticator for every active staff account before enabling MFA.';
  update ssupertea_private.security_settings set require_staff_mfa=true where singleton;
  assert found,'Security settings are missing; apply the setup migration first.';
end;
$$;
commit;
select require_staff_mfa from ssupertea_private.security_settings where singleton;
-- Owner recovery if an enrolled phone is lost: first recover/reset that
-- account's MFA through trusted Supabase administration. For an emergency
-- temporary rollback only, an owner may set require_staff_mfa=false here.
