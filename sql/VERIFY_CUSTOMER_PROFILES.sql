-- Run as the database owner. All temporary profile edits are rolled back.
-- Requires at least two non-anonymous accounts with profile rows.
begin;
select set_config('ssupertea.test_owner', (select id::text from public.profiles order by id limit 1), true);
select set_config('ssupertea.test_other', (select id::text from public.profiles order by id offset 1 limit 1), true);
select set_config('request.jwt.claims', jsonb_build_object('sub',current_setting('ssupertea.test_owner'),'role','authenticated','is_anonymous',false)::text, true);
set local role authenticated;
do $$
declare visible integer; affected integer; rejected boolean;
begin
  select count(*) into visible from public.profiles;
  if visible <> 1 then raise exception 'Profile SELECT must expose exactly the owner row'; end if;
  update public.profiles set full_name='Profile verification', mobile_number='+639171234567'
    where id=current_setting('ssupertea.test_owner')::uuid;
  get diagnostics affected = row_count;
  if affected <> 1 then raise exception 'Owner UPDATE did not succeed'; end if;

  -- Exercise the same partial upsert used by the browser Data API.
  insert into public.profiles(id,mobile_number) values(current_setting('ssupertea.test_owner')::uuid,'+639281234567')
    on conflict(id) do update set id=excluded.id,mobile_number=excluded.mobile_number;
  if not exists(select 1 from public.profiles where full_name='Profile verification' and mobile_number='+639281234567') then
    raise exception 'Partial upsert failed or erased the name';
  end if;

  update public.profiles set address_line1='House 14, Purok 3',city='La Carlota City',province='Negros Occidental',landmark='Blue gate',latitude=10.42,longitude=122.92;
  update public.profiles set mobile_number='+639171234567';
  if not exists(select 1 from public.profiles where address_line1='House 14, Purok 3' and latitude=10.42) then raise exception 'Contact edit erased address'; end if;

  update public.profiles set full_name='Must not change another account' where id=current_setting('ssupertea.test_other')::uuid;
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'Cross-account UPDATE succeeded'; end if;

  rejected := false;
  begin
    insert into public.profiles(id,full_name) values(current_setting('ssupertea.test_other')::uuid,'Wrong owner');
  exception when insufficient_privilege then rejected := true;
  end;
  if not rejected then raise exception 'Cross-account INSERT was not blocked by RLS'; end if;

  rejected := false;
  begin
    update public.profiles set id=current_setting('ssupertea.test_other')::uuid;
  exception when insufficient_privilege then rejected := true;
  end;
  if not rejected then raise exception 'Profile ownership reassignment was not blocked'; end if;

  rejected := false;
  begin update public.profiles set mobile_number='123';
  exception when check_violation then rejected := true;
  end;
  if not rejected then raise exception 'Invalid phone was accepted'; end if;

  rejected := false;
  begin update public.profiles set latitude=null;
  exception when check_violation then rejected := true;
  end;
  if not rejected then raise exception 'Incomplete saved address was accepted'; end if;

  rejected := false;
  begin update public.profiles set created_at=now();
  exception when insufficient_privilege then rejected := true;
  end;
  if not rejected then raise exception 'Managed timestamp was editable'; end if;

  update public.profiles set address_line1=null,city=null,province=null,landmark=null,latitude=null,longitude=null;
  if not exists(select 1 from public.profiles where address_line1 is null and mobile_number='+639171234567') then
    raise exception 'Removing address changed contact details';
  end if;
end;
$$;

-- Anonymous Supabase Auth sessions use authenticated role but must remain blocked.
select set_config('request.jwt.claims', jsonb_build_object('sub',current_setting('ssupertea.test_owner'),'role','authenticated','is_anonymous',true)::text,true);
do $$
begin
  if exists(select 1 from public.profiles) then raise exception 'Anonymous session read a profile'; end if;
end;
$$;

set local role anon;
do $$
declare rejected boolean := false;
begin
  begin perform 1 from public.profiles;
  exception when insufficient_privilege then rejected := true;
  end;
  if not rejected then raise exception 'Anonymous Data API role has profile access'; end if;
end;
$$;
rollback;
select 'PASS: ownership, partial upsert, mobile/address validation, managed timestamps, and anonymous restrictions; temporary edits rolled back' as verification;
