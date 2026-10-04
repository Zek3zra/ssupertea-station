-- Require a non-anonymous staff account for catalog writes.
begin;
alter policy "Managers add menu" on public.menu_catalog with check (((select public.can_manage_orders()) and not coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), false)));
alter policy "Managers edit menu" on public.menu_catalog using (((select public.can_manage_orders()) and not coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), false))) with check (((select public.can_manage_orders()) and not coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), false)));
alter policy "Managers add variants" on public.menu_catalog_variants with check (((select public.can_manage_orders()) and not coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), false)));
alter policy "Managers edit variants" on public.menu_catalog_variants using (((select public.can_manage_orders()) and not coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), false))) with check (((select public.can_manage_orders()) and not coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), false)));
alter policy "Managers add extras" on public.menu_catalog_addons with check (((select public.can_manage_orders()) and not coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), false)));
alter policy "Managers edit extras" on public.menu_catalog_addons using (((select public.can_manage_orders()) and not coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), false))) with check (((select public.can_manage_orders()) and not coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), false)));
commit;
