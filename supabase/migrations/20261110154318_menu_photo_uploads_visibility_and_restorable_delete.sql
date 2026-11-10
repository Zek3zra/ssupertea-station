-- Menu photo uploads and visible-but-unavailable items.
-- Additive setup; this does not reseed or change catalog prices.
alter table public.menu_catalog add column if not exists published boolean not null default true;
alter table public.menu_catalog add column if not exists deleted_at timestamptz;
comment on column public.menu_catalog.published is 'Customer menu visibility. active separately controls whether an item can be ordered.';
-- Incomplete drafts with no price are not customer-facing products.
update public.menu_catalog p set published = false
where published and not exists (select 1 from public.menu_catalog_variants v where v.product_id = p.id);

alter policy "Public active menu" on public.menu_catalog
  using ((published and deleted_at is null) or (select public.can_manage_orders()));
alter policy "Public active variants" on public.menu_catalog_variants
  using ((active and exists (select 1 from public.menu_catalog p where p.id = product_id and p.published and p.deleted_at is null)) or (select public.can_manage_orders()));
alter policy "Public active extras" on public.menu_catalog_addons
  using ((active and exists (select 1 from public.menu_catalog p where p.id = product_id and p.published and p.deleted_at is null)) or (select public.can_manage_orders()));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('menu-photos', 'menu-photos', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = excluded.public,
  file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Menu photos: authorized staff upload" on storage.objects;
create policy "Menu photos: authorized staff upload" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'menu-photos'
    and (select public.can_manage_orders())
    and not coalesce((select (auth.jwt()->>'is_anonymous')::boolean), false)
    and (storage.foldername(name))[1] = 'menu'
    and (storage.foldername(name))[2] = (select auth.uid())::text
    and storage.filename(name) ~ '^[0-9a-f-]{36}\.(jpg|png|webp)$'
  );
-- Public bucket URLs serve the menu photos. No public listing or overwrite/delete
-- policy is granted. Replacements use a fresh UUID, preserving existing files.

-- Keep the existing pricing rules, with an additional published-item check.
-- Recipe labels for new orders; retain percentage IDs for older cached clients.
CREATE OR REPLACE FUNCTION public.price_catalog_order(raw_items jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare
  line jsonb; product public.menu_catalog%rowtype; variant public.menu_catalog_variants%rowtype;
  extra public.menu_catalog_addons%rowtype; extra_id jsonb; extra_ids jsonb;
  quantity integer; sugar_id text; ice_id text; sugar_label text; ice_label text;
  extras jsonb; items jsonb := '[]'; unit_price numeric; total numeric := 0;
begin
  if raw_items is null or jsonb_typeof(raw_items) <> 'array' then raise exception 'Items must be an array'; end if;
  if jsonb_array_length(raw_items) not between 1 and 50 then raise exception 'Choose between 1 and 50 order lines'; end if;
  for line in select value from jsonb_array_elements(raw_items) loop
    if jsonb_typeof(line) <> 'object' or jsonb_typeof(line->'quantity') is distinct from 'number'
      or coalesce(line->>'quantity', '') !~ '^[0-9]{1,2}$' then raise exception 'Invalid quantity'; end if;
    quantity := (line->>'quantity')::integer;
    if quantity not between 1 and 20 then raise exception 'Quantity must be between 1 and 20'; end if;
    select * into product from public.menu_catalog where id = line->>'product_id' and active and published and deleted_at is null;
    if not found then raise exception 'Menu item is unavailable'; end if;
    select * into variant from public.menu_catalog_variants where product_id = product.id and id = line->>'size_id' and active;
    if not found then raise exception 'Size or serving is unavailable'; end if;
    sugar_id := line->>'sugar_id'; ice_id := line->>'ice_id';
    if product.customizable then
      if sugar_id is null or sugar_id not in ('less-sugar','more-sugar','original-recipe','0','25','50','75','100') then raise exception 'Invalid sugar level'; end if;
      if ice_id is null or ice_id not in ('no-ice','less-ice','regular-ice','extra-ice') then raise exception 'Invalid ice level'; end if;
      sugar_label := case sugar_id when 'less-sugar' then 'Less sugar' when 'more-sugar' then 'More sugar' when 'original-recipe' then 'Original recipe' else sugar_id || '%' end;
      ice_label := case ice_id when 'no-ice' then 'No ice' when 'less-ice' then 'Less' when 'regular-ice' then 'Regular' else 'Extra' end;
    else
      if sugar_id is distinct from 'standard' or ice_id is distinct from 'not-applicable' then raise exception 'This item has no sugar or ice customization'; end if;
      sugar_label := 'Standard'; ice_label := 'Not applicable';
    end if;
    extra_ids := coalesce(line->'addon_ids', '[]'::jsonb);
    if jsonb_typeof(extra_ids) <> 'array' then raise exception 'Invalid extras'; end if;
    if jsonb_array_length(extra_ids) > 10 or jsonb_array_length(extra_ids) <> (select count(distinct value) from jsonb_array_elements(extra_ids)) then raise exception 'Duplicate or excessive extras'; end if;
    extras := '[]'; unit_price := variant.price;
    for extra_id in select value from jsonb_array_elements(extra_ids) loop
      if jsonb_typeof(extra_id) <> 'string' then raise exception 'Invalid extra'; end if;
      select * into extra from public.menu_catalog_addons where product_id = product.id and id = extra_id #>> '{}' and active;
      if not found then raise exception 'Extra is unavailable for this item'; end if;
      unit_price := unit_price + extra.price;
      extras := extras || jsonb_build_array(jsonb_build_object('id',extra.id,'label',extra.label,'price',extra.price));
    end loop;
    total := total + unit_price * quantity;
    items := items || jsonb_build_array(jsonb_build_object(
      'product_id',product.id,'name',product.name,'category',product.category,
      'size',jsonb_build_object('id',variant.id,'label',variant.label,'price',variant.price,'surcharge',0),
      'sugar',jsonb_build_object('id',sugar_id,'label',sugar_label),
      'ice',jsonb_build_object('id',ice_id,'label',ice_label),
      'addons',extras,'unit_price',unit_price,'quantity',quantity,'line_total',unit_price * quantity));
  end loop;
  return jsonb_build_object('items',items,'total_price',total);
end;
$function$;
revoke all on function public.price_catalog_order(jsonb) from public, anon, authenticated;
grant execute on function public.price_catalog_order(jsonb) to service_role;
