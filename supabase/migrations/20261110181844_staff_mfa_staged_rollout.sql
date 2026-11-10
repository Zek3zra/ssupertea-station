-- Staged rollout: enforcement stays OFF until staff enroll and the new pages deploy.
-- Enrollment alone does not make the existing application require MFA.
create table ssupertea_private.security_settings (
  singleton boolean primary key default true check (singleton),
  require_staff_mfa boolean not null default false
);
alter table ssupertea_private.security_settings enable row level security;
revoke all on ssupertea_private.security_settings from public, anon, authenticated, service_role;
insert into ssupertea_private.security_settings(singleton,require_staff_mfa) values(true,false);

create function ssupertea_private.staff_mfa_satisfied()
returns boolean language sql stable security invoker set search_path = '' as $$
  select not coalesce((select require_staff_mfa from ssupertea_private.security_settings where singleton),true)
    or coalesce(auth.jwt()->>'aal','aal1') = 'aal2';
$$;
revoke all on function ssupertea_private.staff_mfa_satisfied() from public, anon, authenticated, service_role;

create or replace function public.can_manage_orders()
returns boolean language sql stable security definer set search_path = '' as $$
  select ssupertea_private.staff_mfa_satisfied() and exists (
    select 1 from public.staff_users s where s.user_id=auth.uid() and s.active and s.can_manage_orders
  );
$$;
create or replace function public.can_deliver_orders()
returns boolean language sql stable security definer set search_path = '' as $$
  select ssupertea_private.staff_mfa_satisfied() and exists (
    select 1 from public.staff_users s where s.user_id=auth.uid() and s.active and s.can_deliver_orders
  );
$$;
create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = '' as $$
  select ssupertea_private.staff_mfa_satisfied() and exists (
    select 1 from public.staff_users s where s.user_id=auth.uid() and s.active and (s.can_manage_orders or s.can_deliver_orders)
  );
$$;

-- Own-role discovery must remain available at aal1 so staff can enroll/verify.
-- Preserve the existing server-owned verified-email allowlist synchronization.
create or replace function public.get_my_staff_permissions()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_user_id uuid := auth.uid();
  v_email text;
  v_email_confirmed timestamptz;
  v_rule public.staff_access_rules%rowtype;
  v_staff public.staff_users%rowtype;
  v_required boolean;
begin
  select require_staff_mfa into v_required from ssupertea_private.security_settings where singleton;
  if v_user_id is null then
    return jsonb_build_object('active',false,'can_manage_orders',false,'can_deliver_orders',false,'mfa_required',coalesce(v_required,true));
  end if;
  select lower(u.email),u.email_confirmed_at into v_email,v_email_confirmed
    from auth.users u where u.id=v_user_id and coalesce(u.is_anonymous,false)=false;
  if v_email is null then
    return jsonb_build_object('active',false,'can_manage_orders',false,'can_deliver_orders',false,'mfa_required',coalesce(v_required,true));
  end if;
  if v_email_confirmed is not null then
    select * into v_rule from public.staff_access_rules where email=v_email;
    if found then
      insert into public.staff_users(user_id,can_manage_orders,can_deliver_orders,active)
      values(v_user_id,v_rule.can_manage_orders,v_rule.can_deliver_orders,v_rule.active)
      on conflict(user_id) do update set
        can_manage_orders=excluded.can_manage_orders,
        can_deliver_orders=excluded.can_deliver_orders,
        active=excluded.active;
    end if;
  end if;
  select * into v_staff from public.staff_users where user_id=v_user_id and active=true;
  return jsonb_build_object('active',found,'can_manage_orders',coalesce(v_staff.can_manage_orders,false),
    'can_deliver_orders',coalesce(v_staff.can_deliver_orders,false),'mfa_required',coalesce(v_required,true));
end;
$$;
