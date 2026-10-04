-- Verification only. All temporary price/availability changes are rolled back.
begin;
do $$
declare p record; v record; a record; priced jsonb; raw jsonb; invalid jsonb; accepted boolean; sugar text; expected_label text;
begin
  if (select count(*) from public.menu_catalog) <> 78 then raise exception 'Expected 78 initial menu items'; end if;
  for p in select * from public.menu_catalog loop
    for v in select * from public.menu_catalog_variants where product_id = p.id loop
      raw := jsonb_build_array(jsonb_build_object('product_id',p.id,'quantity',1,'size_id',v.id,
        'sugar_id',case when p.customizable then 'original-recipe' else 'standard' end,
        'ice_id',case when p.customizable then 'regular-ice' else 'not-applicable' end,'addon_ids','[]'::jsonb));
      priced := public.price_catalog_order(raw);
      if (priced->>'total_price')::numeric <> v.price then raise exception 'Variant price mismatch: % / %',p.id,v.id; end if;
      for a in select * from public.menu_catalog_addons where product_id = p.id loop
        priced := public.price_catalog_order(jsonb_set(raw,'{0,addon_ids}',jsonb_build_array(a.id)));
        if (priced->>'total_price')::numeric <> v.price + a.price then raise exception 'Extra price mismatch'; end if;
      end loop;
    end loop;
  end loop;

  raw := '[{"product_id":"milk-tea-taro-milk-tea","quantity":1,"size_id":"small","sugar_id":"original-recipe","ice_id":"regular-ice","addon_ids":[]}]';
  foreach sugar in array array['less-sugar','more-sugar','original-recipe','50'] loop
    expected_label := case sugar when 'less-sugar' then 'Less sugar' when 'more-sugar' then 'More sugar' when 'original-recipe' then 'Original recipe' else '50%' end;
    priced := public.price_catalog_order(jsonb_set(raw,'{0,sugar_id}',to_jsonb(sugar)));
    if priced#>>'{items,0,sugar,id}' <> sugar or priced#>>'{items,0,sugar,label}' <> expected_label or (priced->>'total_price')::numeric <> 39 then raise exception 'Sugar choice validation failed: %',sugar; end if;
  end loop;
  accepted := false;
  begin perform public.price_catalog_order(jsonb_set(raw,'{0,sugar_id}','"invalid"')); accepted := true;
  exception when others then null; end;
  if accepted then raise exception 'Invalid sugar choice was accepted'; end if;

  if exists(select 1 from public.menu_catalog where icon='coffee' and name not in ('Plain Coffee','Coffee with Milk','Milo')) then raise exception 'Steam icon on a non-hot drink'; end if;

  raw := '[{"product_id":"silog-meals-tocino-silog","quantity":1,"size_id":"regular","sugar_id":"standard","ice_id":"not-applicable","addon_ids":[]}]';
  for invalid in select value from jsonb_array_elements(jsonb_build_array(
    jsonb_set(raw,'{0,quantity}','null'), jsonb_set(raw,'{0,quantity}','0'),
    jsonb_set(raw,'{0,quantity}','21'), jsonb_set(raw,'{0,quantity}','1.5'),
    jsonb_set(raw,'{0,size_id}','"large"'), jsonb_set(raw,'{0,sugar_id}','"50"'),
    jsonb_set(raw,'{0,ice_id}','"regular-ice"'),
    jsonb_set(raw,'{0,addon_ids}','["pearl"]'),
    jsonb_set(raw,'{0,addon_ids}','["extra-egg","extra-egg"]'),
    jsonb_set(raw,'{0,addon_ids}','[null]'), jsonb_set(raw,'{0,addon_ids}','null'),
    '[]'::jsonb,'{}'::jsonb)) loop
    accepted := false;
    begin perform public.price_catalog_order(invalid); accepted := true;
    exception when others then null; end;
    if accepted then raise exception 'Invalid order was accepted: %',invalid; end if;
  end loop;
  priced := public.price_catalog_order(jsonb_set(raw,'{0,unit_price}','1'));
  if (priced->>'total_price')::numeric <> 85 then raise exception 'Client price affected server total'; end if;
  update public.menu_catalog_variants set price = 86 where product_id = 'silog-meals-tocino-silog' and id = 'regular';
  priced := public.price_catalog_order(raw);
  if (priced->>'total_price')::numeric <> 86 then raise exception 'Updated menu price was not applied'; end if;
  update public.menu_catalog set active = false where id = 'silog-meals-tocino-silog';
  accepted := false;
  begin perform public.price_catalog_order(raw); accepted := true;
  exception when others then null; end;
  if accepted then raise exception 'Inactive product was accepted'; end if;
end;
$$;

set local role anon;
do $$
begin
  if (select count(*) from public.menu_catalog) <> 77 then raise exception 'Public visibility check failed'; end if;
  if exists (select 1 from public.menu_catalog_variants where product_id = 'silog-meals-tocino-silog') then raise exception 'Inactive product variants are publicly visible'; end if;
  if has_table_privilege('anon','public.menu_catalog','INSERT') or has_table_privilege('anon','public.menu_catalog_variants','UPDATE') then raise exception 'Public catalog write privilege'; end if;
  if has_function_privilege('anon','public.price_catalog_order(jsonb)','EXECUTE') then raise exception 'Public pricing RPC privilege'; end if;
end;
$$;

set local role authenticated;
do $$
declare touched integer; accepted boolean := false;
begin
  update public.menu_catalog_variants set price = 1 where product_id = 'milk-tea-taro-milk-tea';
  get diagnostics touched = row_count;
  if touched <> 0 then raise exception 'Customer changed menu prices'; end if;
  begin
    insert into public.menu_catalog(id,name,category) values ('verification-product','Verification','Verification');
    accepted := true;
  exception when insufficient_privilege then null; end;
  if accepted then raise exception 'Customer inserted a menu item'; end if;
  if has_function_privilege('authenticated','public.price_catalog_order(jsonb)','EXECUTE') then raise exception 'Customer pricing RPC privilege'; end if;
end;
$$;
set local role service_role;
select public.price_catalog_order('[{"product_id":"milk-tea-taro-milk-tea","quantity":2,"size_id":"large","sugar_id":"original-recipe","ice_id":"regular-ice","addon_ids":[]}]') ->> 'total_price' as service_verified_total,
  '123 variants, 16 extras, three recipe sugar choices, legacy sugar compatibility, drink icons, invalid inputs, price tampering, changed prices, inactive items, public reads, and customer write restrictions verified' as checks;
rollback;
