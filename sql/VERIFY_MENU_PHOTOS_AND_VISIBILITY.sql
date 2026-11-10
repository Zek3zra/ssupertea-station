-- Run after MENU_PHOTO_UPLOADS_AND_VISIBILITY.sql.
-- All temporary availability/visibility changes below are rolled back.
begin;
update public.menu_catalog set active = false, published = true, deleted_at = null
  where id = 'milk-tea-cookies-and-cream-milk-tea';
set local role anon;
do $$ begin
  if not exists (select 1 from public.menu_catalog where id = 'milk-tea-cookies-and-cream-milk-tea' and not active) then
    raise exception 'Unavailable published item is not visible';
  end if;
  if not exists (select 1 from public.menu_catalog_variants where product_id = 'milk-tea-cookies-and-cream-milk-tea') then
    raise exception 'Unavailable item prices are not visible';
  end if;
end $$;
reset role;
set local role authenticated;
do $$ declare changed integer; begin
  if not exists (select 1 from public.menu_catalog where id='milk-tea-cookies-and-cream-milk-tea') then raise exception 'Published unavailable item should be readable'; end if;
  update public.menu_catalog set deleted_at=now() where id='milk-tea-cookies-and-cream-milk-tea';
  get diagnostics changed = row_count;
  if changed <> 0 then raise exception 'Customer could delete a menu item'; end if;
end $$;
reset role;
set local role service_role;
do $$ begin
  begin
    perform public.price_catalog_order('[{"product_id":"milk-tea-cookies-and-cream-milk-tea","size_id":"small","sugar_id":"original-recipe","ice_id":"regular-ice","quantity":1,"addon_ids":[]}]');
    raise exception 'Unavailable item was priced';
  exception when others then if sqlerrm <> 'Menu item is unavailable' then raise; end if; end;
end $$;
reset role;

update public.menu_catalog set active = true, published = false
  where id = 'milk-tea-cookies-and-cream-milk-tea';
set local role anon;
do $$ begin
  if exists (select 1 from public.menu_catalog where id = 'milk-tea-cookies-and-cream-milk-tea') then raise exception 'Hidden draft is publicly visible'; end if;
end $$;
reset role;
set local role service_role;
do $$ begin
  begin
    perform public.price_catalog_order('[{"product_id":"milk-tea-cookies-and-cream-milk-tea","size_id":"small","sugar_id":"original-recipe","ice_id":"regular-ice","quantity":1,"addon_ids":[]}]');
    raise exception 'Hidden draft was priced';
  exception when others then if sqlerrm <> 'Menu item is unavailable' then raise; end if; end;
end $$;
reset role;

-- Deleted items remain blocked even if another client incorrectly marks them active.
update public.menu_catalog set active = true, published = true, deleted_at = now()
  where id = 'milk-tea-cookies-and-cream-milk-tea';
set local role anon;
do $$ begin
  if exists (select 1 from public.menu_catalog where id = 'milk-tea-cookies-and-cream-milk-tea') then raise exception 'Deleted item is publicly visible'; end if;
end $$;
reset role;
set local role service_role;
do $$ begin
  begin
    perform public.price_catalog_order('[{"product_id":"milk-tea-cookies-and-cream-milk-tea","size_id":"small","sugar_id":"original-recipe","ice_id":"regular-ice","quantity":1,"addon_ids":[]}]');
    raise exception 'Deleted item was priced';
  exception when others then if sqlerrm <> 'Menu item is unavailable' then raise; end if; end;
end $$;
reset role;
rollback;

select jsonb_build_object(
  'bucket', (select jsonb_build_object('id',id,'public',public,'max_bytes',file_size_limit,'types',allowed_mime_types) from storage.buckets where id='menu-photos'),
  'staff_upload_policy_exists', exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='Menu photos: authorized staff upload' and cmd='INSERT'),
  'public_pricing_denied', not has_function_privilege('anon','public.price_catalog_order(jsonb)','execute'),
  'customer_pricing_denied', not has_function_privilege('authenticated','public.price_catalog_order(jsonb)','execute'),
  'catalog_count', (select count(*) from public.menu_catalog),
  'menu_photos', (select count(*) from storage.objects where bucket_id='menu-photos')
) as verification;
