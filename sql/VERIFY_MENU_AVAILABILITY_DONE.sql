-- Temporary fixtures are never committed or visible to other sessions.
begin;
do $test$
declare
  item_id text := 'availability-test-' || gen_random_uuid()::text;
  manager_id uuid;
  saved jsonb;
  current_version timestamptz;
  old_version timestamptz := '2000-01-01T00:00:00Z';
begin
  select user_id into manager_id from public.staff_users where active and can_manage_orders limit 1;
  assert manager_id is not null, 'A manager is required to verify the staff flow.';
  insert into public.menu_catalog(id,name,category,icon,variant_label,active,published,updated_at)
    values(item_id,'Availability test','Test','cup','Size',true,true,old_version);
  insert into public.menu_catalog_variants(product_id,id,label,price,active,sort_order,updated_at)
    values(item_id,'small','Small',39,true,0,old_version),(item_id,'large','Large',65,true,1,old_version);
  insert into public.menu_catalog_addons(product_id,id,label,price,active,sort_order,updated_at)
    values(item_id,'egg','Extra egg',20,true,0,old_version);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',manager_id,'role','authenticated','is_anonymous',false)::text,true);
  execute 'set local role authenticated';

  saved := public.save_menu_availability(item_id,old_version,false,'[]');
  assert (saved->>'active')::boolean = false, 'Overall pause failed';
  assert (select bool_and(active) from public.menu_catalog_variants where product_id=item_id), 'Overall pause changed size choices';
  assert (select active from public.menu_catalog_addons where product_id=item_id and id='egg'), 'Overall pause changed extras';
  current_version := (saved->>'updated_at')::timestamptz;
  saved := public.save_menu_availability(item_id,current_version,true,jsonb_build_array(
    jsonb_build_object('kind','variants','id','small','active',false,'expected_updated_at',old_version),
    jsonb_build_object('kind','addons','id','egg','active',false,'expected_updated_at',old_version)));
  assert (saved->>'active')::boolean, 'Item did not resume';
  assert (select not active from public.menu_catalog_variants where product_id=item_id and id='small'), 'Small remained available';
  assert (select active from public.menu_catalog_variants where product_id=item_id and id='large'), 'Other size was changed';
  assert (select not active from public.menu_catalog_addons where product_id=item_id and id='egg'), 'Extra remained available';
  assert (select price=39 from public.menu_catalog_variants where product_id=item_id and id='small'), 'Price was modified';
  current_version := (saved->>'updated_at')::timestamptz;

  -- The first write must roll back if a later size has a stale version.
  begin
    perform public.save_menu_availability(item_id,current_version,false,jsonb_build_array(
      jsonb_build_object('kind','variants','id','small','active',true,'expected_updated_at',(select updated_at from public.menu_catalog_variants where product_id=item_id and id='small')),
      jsonb_build_object('kind','variants','id','large','active',false,'expected_updated_at','1999-01-01T00:00:00Z')));
    raise exception 'Expected child conflict was not raised';
  exception when serialization_failure then null;
  end;
  assert (select not active from public.menu_catalog_variants where product_id=item_id and id='small'), 'Conflict left a partial size write';
  assert (select active from public.menu_catalog where id=item_id), 'Conflict left a partial item write';
  begin
    perform public.save_menu_availability(item_id,old_version,false,'[]');
    raise exception 'Expected parent conflict was not raised';
  exception when serialization_failure then null;
  end;
  begin
    perform public.save_menu_availability(item_id,current_version,true,jsonb_build_array(
      jsonb_build_object('kind','variants','id','large','active',false,'expected_updated_at',old_version)));
    raise exception 'An item with no available sizes was enabled';
  exception when invalid_parameter_value then null;
  end;
  assert (select active from public.menu_catalog_variants where product_id=item_id and id='large'), 'Invalid request left a partial write';
  begin
    perform public.save_menu_availability(item_id,current_version,false,jsonb_build_array(
      jsonb_build_object('kind','variants','id','other-item-size','active',false,'expected_updated_at',old_version)));
    raise exception 'Missing or foreign size was accepted';
  exception when serialization_failure then null;
  end;
  execute 'reset role';
  -- A normal customer and an anonymous signed-in user must both be refused.
  perform set_config('request.jwt.claims',jsonb_build_object('sub',gen_random_uuid(),'role','authenticated','is_anonymous',false)::text,true);
  execute 'set local role authenticated';
  begin
    perform public.save_menu_availability(item_id,current_version,false,'[]');
    raise exception 'Customer edited availability';
  exception when insufficient_privilege then null;
  end;
  execute 'reset role';
  perform set_config('request.jwt.claims',jsonb_build_object('sub',manager_id,'role','authenticated','is_anonymous',true)::text,true);
  execute 'set local role authenticated';
  begin
    perform public.save_menu_availability(item_id,current_version,false,'[]');
    raise exception 'Anonymous session edited availability';
  exception when insufficient_privilege then null;
  end;
  execute 'reset role';
  assert not has_function_privilege('anon','public.save_menu_availability(text,timestamptz,boolean,jsonb)','execute'), 'Public execution must be revoked';
  assert not (select prosecdef from pg_proc where oid='public.save_menu_availability(text,timestamptz,boolean,jsonb)'::regprocedure), 'Function must respect caller RLS';
end;
$test$;
rollback;
select 'PASS: overall pause, size/extra changes, preserved prices, atomic rollback, stale edits, missing sizes, customer/anonymous denial, invoker permissions' as verification;
