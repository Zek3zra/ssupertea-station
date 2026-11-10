-- All order/staff/counter fixtures and activity events roll back together.
begin;
do $test$
declare
  manager_id uuid;
  rider_id uuid;
  customer_id uuid;
  first_order uuid := gen_random_uuid();
  second_order uuid := gen_random_uuid();
  failed boolean;
  result jsonb;
  event_count bigint;
  i integer;
begin
  select user_id into manager_id from public.staff_users where active and can_manage_orders limit 1;
  select user_id into rider_id from public.staff_users where active and can_deliver_orders limit 1;
  select id into customer_id from auth.users u where not coalesce(u.is_anonymous,false)
    and not exists(select 1 from public.staff_users s where s.user_id=u.id and s.active) limit 1;
  assert manager_id is not null and rider_id is not null and customer_id is not null,'Manager, rider and customer accounts are required for this verification.';

  -- Use an existing non-staff account with no active order. Never cancel or
  -- edit an existing live order just to make this verification pass.
  select id into customer_id from auth.users u where not coalesce(u.is_anonymous,false)
    and not exists(select 1 from public.staff_users s where s.user_id=u.id and s.active)
    and not exists(select 1 from public.orders o where o.customer_session_token=u.id and o.status in ('pending','preparing','dispatched')) limit 1;
  assert customer_id is not null,'Finish the test customer active order before running this rollback-only check.';

  perform set_config('request.jwt.claims','{"role":"service_role"}',true);
  execute 'set local role service_role';
  insert into public.orders(id,customer_session_token,customer_name,customer_phone,order_type,items,items_subtotal,delivery_fee,total_price,status,delivery_address,delivery_lat,delivery_lng,route_distance_m,route_duration_s,created_at,request_fingerprint)
    values(first_order,customer_id,'__order_reliability_test__','+639171234567','delivery','[{"name":"Test tea","quantity":1}]',39,10,49,'pending','Rollback-only test address',10.407,122.998,300,120,now()-interval '11 minutes',repeat('a',64));
  execute 'reset role';
  assert (select count(*)=1 from public.order_events where order_id=first_order and event_type='order_created' and actor_user_id=customer_id),'Creation must produce exactly one customer activity event';

  perform set_config('request.jwt.claims',jsonb_build_object('sub',customer_id,'role','authenticated','is_anonymous',false)::text,true);
  execute 'set local role authenticated';
  assert (select count(*)=0 from public.order_events where order_id=first_order),'Customer must not read private staff activity';
  failed:=false;
  begin perform public.consume_order_action(customer_id,'create'); exception when insufficient_privilege then failed:=true; end;
  assert failed,'A customer must not edit the rate-limit counter';
  failed:=false;
  begin perform public.admin_confirm_order(first_order); exception when insufficient_privilege then failed:=true; end;
  assert failed,'A customer must not confirm an order';
  execute 'reset role';

  perform set_config('request.jwt.claims',jsonb_build_object('sub',manager_id,'role','authenticated','is_anonymous',false)::text,true);
  execute 'set local role authenticated';
  assert (select count(*)=1 from public.order_events where order_id=first_order),'Manager must read activity';
  failed:=false;
  begin update public.orders set total_price=1 where id=first_order; exception when insufficient_privilege then failed:=true; end;
  assert failed,'Even a staff client must not rewrite a recorded order price directly';
  failed:=false;
  begin insert into public.order_events(order_id,event_type,actor_kind) values(first_order,'order_updated','staff'); exception when insufficient_privilege then failed:=true; end;
  assert failed,'Staff must not forge activity';
  perform public.admin_confirm_order(first_order);
  perform public.admin_assign_rider(first_order,rider_id);
  assert (select count(*)=1 from public.order_events where order_id=first_order and event_type='status_changed' and to_status='preparing' and actor_user_id=manager_id),'Confirmation must record the acting manager';
  assert (select count(*)=1 from public.order_events where order_id=first_order and event_type='rider_assigned' and actor_user_id=manager_id),'Assignment must be recorded';
  execute 'reset role';

  -- A cancellation racing after confirmation must not undo Preparing.
  perform set_config('request.jwt.claims','{"role":"service_role"}',true);
  execute 'set local role service_role';
  failed:=false;
  begin perform public.cancel_customer_order(first_order,customer_id); exception when others then failed:=true; end;
  assert failed,'Confirmed order must reject customer cancellation';
  execute 'reset role';
  assert (select status='preparing' from public.orders where id=first_order),'Rejected cancellation must preserve order state';

  perform set_config('request.jwt.claims',jsonb_build_object('sub',rider_id,'role','authenticated','is_anonymous',false)::text,true);
  execute 'set local role authenticated';
  assert (select count(*)=0 from public.order_events where order_id=first_order) or public.can_manage_orders(),'Rider-only staff must not read private admin activity';
  perform public.rider_start_delivery(first_order);
  perform public.rider_update_delivery_location(first_order,10.407,122.998,8);
  perform public.rider_complete_delivery(first_order);
  failed:=false;
  begin perform public.rider_complete_delivery(first_order); exception when others then failed:=true; end;
  assert failed,'Repeated completion must not repeat the state transition';
  execute 'reset role';
  assert (select status='completed' from public.orders where id=first_order),'Delivery should finish';
  assert (select count(*)=1 from public.order_events where order_id=first_order and to_status='completed' and actor_user_id=rider_id),'Completion must be recorded once with rider identity';
  assert not exists(select 1 from public.order_delivery_locations where order_id=first_order),'Completion must remove live GPS';
  assert not exists(select 1 from public.order_events where order_id=first_order and metadata::text like '%Rollback-only test address%'),'Activity must not copy addresses';

  perform set_config('request.jwt.claims','{"role":"service_role"}',true);
  execute 'set local role service_role';
  insert into public.orders(id,customer_session_token,customer_name,order_type,items,items_subtotal,delivery_fee,total_price,status,created_at)
    values(second_order,customer_id,'__order_reliability_test__','pickup','[{"name":"Test tea","quantity":1}]',39,0,39,'pending',now()-interval '11 minutes');
  failed:=false;
  begin
    insert into public.orders(id,customer_session_token,customer_name,order_type,items,items_subtotal,delivery_fee,total_price,status)
      values(gen_random_uuid(),customer_id,'__order_reliability_test__','pickup','[{"name":"Test tea","quantity":1}]',39,0,39,'pending');
  exception when unique_violation then failed:=true; end;
  assert failed,'Database must enforce one unfinished order per customer';
  perform public.cancel_customer_order(second_order,customer_id);
  perform public.cancel_customer_order(second_order,customer_id);
  execute 'reset role';
  assert (select count(*)=1 from public.order_events where order_id=second_order and to_status='cancelled' and actor_user_id=customer_id),'Cancellation retry must not duplicate its event';

  -- Counter fixtures are rolled back; no real account is left throttled.
  delete from ssupertea_private.order_action_limits where user_id=customer_id;
  execute 'set local role service_role';
  for i in 1..12 loop result:=public.consume_order_action(customer_id,'create'); assert (result->>'allowed')::boolean,'Normal create budget should be allowed'; end loop;
  result:=public.consume_order_action(customer_id,'create'); assert not (result->>'allowed')::boolean,'13th create attempt must be limited';
  for i in 1..6 loop result:=public.consume_order_action(customer_id,'cancel'); assert (result->>'allowed')::boolean,'Cancellation budget should be independent'; end loop;
  result:=public.consume_order_action(customer_id,'cancel'); assert not (result->>'allowed')::boolean,'7th cancellation must be limited';
  execute 'reset role';
  update ssupertea_private.order_action_limits set window_start=clock_timestamp()-interval '61 seconds' where user_id=customer_id;
  execute 'set local role service_role';
  result:=public.consume_order_action(customer_id,'create'); assert (result->>'allowed')::boolean,'Expired counter window should reset';
  execute 'reset role';
  assert not has_table_privilege('authenticated','public.order_events','insert'),'Clients must not insert events';
  assert not has_table_privilege('authenticated','public.order_events','update'),'Clients must not edit events';
  assert not has_table_privilege('authenticated','public.order_events','delete'),'Clients must not erase events';
  assert not has_function_privilege('anon','public.consume_order_action(uuid,text)','execute'),'Counter must not be public';
end;
$test$;
rollback;
select 'PASS: actor history, private read/write permissions, checked staff RPCs, terminal states, cancellation retry, one-active-order constraint, GPS cleanup, persistent account limits and reset' as verification;
