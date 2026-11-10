-- Save the item's availability and all changed sizes/extras as one transaction.
-- Existing catalog RLS still applies; no prices, photos or order records are written.
create or replace function public.save_menu_availability(
  p_product_id text,
  p_expected_updated_at timestamptz,
  p_active boolean,
  p_changes jsonb default '[]'::jsonb
) returns jsonb
language plpgsql security invoker set search_path = ''
as $function$
declare
  product public.menu_catalog%rowtype;
  change jsonb;
  affected integer;
begin
  if auth.uid() is null or coalesce((auth.jwt()->>'is_anonymous')::boolean, false)
     or not coalesce(public.can_manage_orders(), false) then
    raise exception 'Only authorized store admins can edit the menu.' using errcode = '42501';
  end if;
  if p_active is null or p_expected_updated_at is null or jsonb_typeof(p_changes) is distinct from 'array' then
    raise exception 'Invalid availability changes.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_changes) > 200 then
    raise exception 'Too many availability changes.' using errcode = '22023';
  end if;
  select * into product from public.menu_catalog where id = p_product_id for update;
  if not found or product.deleted_at is not null then
    raise exception 'This item is missing or deleted. Refresh the menu before saving.';
  end if;
  if product.updated_at is distinct from p_expected_updated_at then
    raise exception 'This item changed on another device. Refresh the menu before saving.' using errcode = '40001';
  end if;
  if exists (select 1 from jsonb_array_elements(p_changes) c group by c->>'kind', c->>'id' having count(*) > 1) then
    raise exception 'Duplicate availability changes.' using errcode = '22023';
  end if;
  -- Lock all sizes before checking whether the item can be ordered.
  perform 1 from public.menu_catalog_variants where product_id = p_product_id order by id for update;
  for change in select value from jsonb_array_elements(p_changes) loop
    if jsonb_typeof(change) is distinct from 'object'
       or coalesce(change->>'kind', '') not in ('variants', 'addons')
       or coalesce(change->>'id', '') !~ '^[a-z0-9-]{1,80}$'
       or jsonb_typeof(change->'active') is distinct from 'boolean'
       or nullif(change->>'expected_updated_at', '') is null then
      raise exception 'Invalid size or extra availability.' using errcode = '22023';
    end if;
    if change->>'kind' = 'variants' then
      update public.menu_catalog_variants set active = (change->>'active')::boolean
      where product_id = p_product_id and id = change->>'id'
        and updated_at = (change->>'expected_updated_at')::timestamptz;
    else
      update public.menu_catalog_addons set active = (change->>'active')::boolean
      where product_id = p_product_id and id = change->>'id'
        and updated_at = (change->>'expected_updated_at')::timestamptz;
    end if;
    get diagnostics affected = row_count;
    if affected <> 1 then
      raise exception 'A size or extra changed on another device. Refresh the menu before saving.' using errcode = '40001';
    end if;
  end loop;
  if p_active and not exists (select 1 from public.menu_catalog_variants where product_id = p_product_id and active) then
    raise exception 'Select an available size or serving before making this item available.' using errcode = '22023';
  end if;
  update public.menu_catalog set active = p_active where id = p_product_id returning * into product;
  if not found then raise exception 'Access to this item was removed. Reopen Admin before saving.' using errcode = '42501'; end if;
  return to_jsonb(product) || jsonb_build_object(
    'menu_catalog_variants', coalesce((select jsonb_agg(to_jsonb(v) order by v.sort_order, v.id) from public.menu_catalog_variants v where v.product_id = p_product_id), '[]'::jsonb),
    'menu_catalog_addons', coalesce((select jsonb_agg(to_jsonb(a) order by a.sort_order, a.id) from public.menu_catalog_addons a where a.product_id = p_product_id), '[]'::jsonb)
  );
end;
$function$;
revoke all on function public.save_menu_availability(text, timestamptz, boolean, jsonb) from public, anon;
grant execute on function public.save_menu_availability(text, timestamptz, boolean, jsonb) to authenticated;
