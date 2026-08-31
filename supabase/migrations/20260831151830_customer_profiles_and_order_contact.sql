-- Additive customer data update. Existing order ownership/staff policies stay unchanged.
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  mobile_number text,
  address_line1 text,
  city text,
  province text,
  landmark text,
  latitude double precision,
  longitude double precision,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_name_check check (full_name is null or char_length(btrim(full_name)) between 2 and 120),
  constraint profiles_mobile_check check (mobile_number is null or mobile_number ~ '^\+639[0-9]{9}$'),
  constraint profiles_address_check check (
    (address_line1 is null and city is null and province is null and landmark is null and latitude is null and longitude is null)
    or (
      address_line1 is not null and char_length(btrim(address_line1)) between 3 and 180
      and city is not null and char_length(btrim(city)) between 2 and 100
      and province is not null and char_length(btrim(province)) between 2 and 100
      and (landmark is null or char_length(landmark) <= 120)
      and latitude is not null and latitude between 4.2 and 21.5
      and longitude is not null and longitude between 116 and 127.5
      and char_length(address_line1 || ', ' || city || ', ' || province || coalesce(' — Landmark: ' || landmark, '')) <= 500
    )
  )
);

alter table public.profiles enable row level security;
revoke all on public.profiles from public, anon, authenticated;
grant select on public.profiles to authenticated;
grant insert (id, full_name, mobile_number, address_line1, city, province, landmark, latitude, longitude),
      update (id, full_name, mobile_number, address_line1, city, province, landmark, latitude, longitude)
      on public.profiles to authenticated;
grant all on public.profiles to service_role;

create policy profiles_select_own on public.profiles for select to authenticated
using ((select auth.uid()) = id and coalesce((select auth.jwt()->>'is_anonymous'), 'false') = 'false');
create policy profiles_insert_own on public.profiles for insert to authenticated
with check ((select auth.uid()) = id and coalesce((select auth.jwt()->>'is_anonymous'), 'false') = 'false');
create policy profiles_update_own on public.profiles for update to authenticated
using ((select auth.uid()) = id and coalesce((select auth.jwt()->>'is_anonymous'), 'false') = 'false')
with check ((select auth.uid()) = id and coalesce((select auth.jwt()->>'is_anonymous'), 'false') = 'false');

create function public.touch_customer_profile() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  new.created_at := old.created_at;
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function public.touch_customer_profile() from public, anon, authenticated;
create trigger profiles_touch_updated_at before update on public.profiles
for each row execute function public.touch_customer_profile();

-- Copy only an existing display name. Never invent a phone/address or copy roles.
insert into public.profiles (id, full_name)
select id, case when char_length(display_name) >= 2 then left(display_name,120) else null end
from (
  select id, btrim(regexp_replace(coalesce(nullif(raw_user_meta_data->>'full_name',''),raw_user_meta_data->>'name',''), '\s+', ' ', 'g')) as display_name
  from auth.users where is_anonymous is not true
) existing_users;

-- Nullable for historical orders and compatibility while the app update deploys.
-- New checkouts require a validated number in api/create-order.js.
alter table public.orders add column customer_phone text;
alter table public.orders add constraint orders_customer_phone_check
check (customer_phone is null or customer_phone ~ '^\+639[0-9]{9}$');
comment on column public.orders.customer_phone is 'Mobile contact snapshot supplied at checkout; profile edits never rewrite historical orders.';
comment on table public.profiles is 'Private account details and one optional default delivery address. No passwords or staff permissions.';
