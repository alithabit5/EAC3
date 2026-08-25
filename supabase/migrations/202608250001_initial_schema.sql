create extension if not exists pgcrypto;

create type public.app_role as enum ('admin', 'collector');
create type public.batch_status as enum ('Open', 'Closed');
create type public.shipment_payment_status as enum ('Paid', 'Partial', 'Not Paid');
create type public.shipment_status as enum ('Received At Origin Facility', 'Departed in Transit', 'Customs Clearance', 'At Final Destination', 'Out For Delivery', 'Collected');
create type public.collection_status as enum ('Pending', 'Collected');
create type public.order_status as enum ('Pending', 'Completed');
create type public.batch_series as enum ('Sea', 'AirExpress', 'AirNormal', 'MoneyCollection', 'Order');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  role public.app_role not null default 'collector',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.config_values (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('destination', 'location', 'zone', 'team_member')),
  value text not null,
  created_at timestamptz not null default now(),
  unique (kind, value)
);

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index customers_name_lower_idx on public.customers (lower(name));

create table public.batches (
  id uuid primary key default gen_random_uuid(),
  series public.batch_series not null,
  number integer not null check (number > 0),
  label text not null,
  status public.batch_status not null default 'Open',
  start_date date not null default current_date,
  end_date date,
  date_loaded date,
  container_no text,
  bl_no text,
  document_name text,
  document_path text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (series, number),
  unique (series, label)
);

create unique index one_open_batch_per_series
  on public.batches (series) where status = 'Open';

create table public.shipments (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.batches(id),
  date date not null default current_date,
  invoice_no text not null,
  sender_name text not null,
  sender_phone text not null default '',
  receiver_name text not null,
  receiver_phone text not null default '',
  location text not null default '',
  main_destination text not null check (main_destination in ('ZNZ', 'Dar', 'Pemba')),
  destination text not null,
  type text not null check (type in ('Air - Normal Cargo', 'Air - Express Cargo', 'Sea Freight')),
  weight numeric(12, 3) not null default 0 check (weight >= 0),
  description text not null default '',
  cost numeric(12, 3) not null default 0 check (cost >= 0),
  payment_status public.shipment_payment_status not null default 'Not Paid',
  payment_method text not null default '',
  status public.shipment_status not null default 'Received At Origin Facility',
  team_member text not null default '',
  document_name text,
  document_path text,
  created_by uuid not null references auth.users(id),
  updated_by uuid not null references auth.users(id),
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  cancelled_at timestamptz,
  cancelled_by uuid references auth.users(id),
  unique (invoice_no)
);

create table public.collections (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.batches(id),
  date date not null default current_date,
  collector_name text not null,
  customer_name text not null,
  customer_phone text not null default '',
  location text not null,
  amount_due numeric(12, 3) not null default 0 check (amount_due >= 0),
  amount_collected numeric(12, 3) check (amount_collected is null or amount_collected >= 0),
  status public.collection_status not null default 'Pending',
  notes text not null default '',
  created_by uuid not null references auth.users(id),
  updated_by uuid not null references auth.users(id),
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  cancelled_at timestamptz,
  cancelled_by uuid references auth.users(id)
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.batches(id),
  date date not null default current_date,
  team_member text not null,
  customer_name text not null,
  customer_phone text not null default '',
  zone text not null,
  status public.order_status not null default 'Pending',
  notes text not null default '',
  created_by uuid not null references auth.users(id),
  updated_by uuid not null references auth.users(id),
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  cancelled_at timestamptz,
  cancelled_by uuid references auth.users(id)
);

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references auth.users(id),
  entity_type text not null,
  entity_id uuid not null,
  action text not null check (action in ('create', 'update', 'cancel', 'confirm', 'reopen')),
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default now()
);

create index shipments_batch_id_idx on public.shipments(batch_id);
create index collections_batch_id_idx on public.collections(batch_id);
create index orders_batch_id_idx on public.orders(batch_id);
create index audit_events_entity_idx on public.audit_events(entity_type, entity_id, created_at desc);

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin') $$;

alter table public.profiles enable row level security;
alter table public.config_values enable row level security;
alter table public.customers enable row level security;
alter table public.batches enable row level security;
alter table public.shipments enable row level security;
alter table public.collections enable row level security;
alter table public.orders enable row level security;
alter table public.audit_events enable row level security;

create policy "authenticated users can read profiles" on public.profiles for select to authenticated using (true);
create policy "admins manage profiles" on public.profiles for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "authenticated users read config" on public.config_values for select to authenticated using (true);
create policy "admins manage config" on public.config_values for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "authenticated users read customers" on public.customers for select to authenticated using (true);
create policy "authenticated users add customers" on public.customers for insert to authenticated with check (true);
create policy "authenticated users update customers" on public.customers for update to authenticated using (true) with check (true);

create policy "authenticated users read batches" on public.batches for select to authenticated using (true);
create policy "admins manage batches" on public.batches for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "authenticated users read shipments" on public.shipments for select to authenticated using (cancelled_at is null or public.is_admin());
create policy "authenticated users add shipments" on public.shipments for insert to authenticated with check (created_by = auth.uid() and updated_by = auth.uid());
create policy "users update shipments" on public.shipments for update to authenticated using (created_by = auth.uid() or public.is_admin()) with check (updated_by = auth.uid());

create policy "admins read all collections" on public.collections for select to authenticated using (public.is_admin());
create policy "collectors read own collections" on public.collections for select to authenticated using (created_by = auth.uid() and cancelled_at is null);
create policy "users add own collections" on public.collections for insert to authenticated with check (created_by = auth.uid() and updated_by = auth.uid());
create policy "users update own collections" on public.collections for update to authenticated using (created_by = auth.uid() or public.is_admin()) with check (updated_by = auth.uid());

create policy "admins read all orders" on public.orders for select to authenticated using (public.is_admin());
create policy "collectors read own orders" on public.orders for select to authenticated using (created_by = auth.uid() and cancelled_at is null);
create policy "users add own orders" on public.orders for insert to authenticated with check (created_by = auth.uid() and updated_by = auth.uid());
create policy "users update own orders" on public.orders for update to authenticated using (created_by = auth.uid() or public.is_admin()) with check (updated_by = auth.uid());

create policy "admins read audit events" on public.audit_events for select to authenticated using (public.is_admin());

insert into public.config_values (kind, value) values
  ('destination', 'Singida'), ('destination', 'Kigoma'), ('destination', 'Uganda'), ('destination', 'Mombasa'), ('destination', 'Mwanza'), ('destination', 'Geita'), ('destination', 'Mbeya'),
  ('location', 'Mabela'), ('location', 'Amrat'), ('location', 'Al Hail'),
  ('zone', 'Zone A'), ('zone', 'Zone B'), ('zone', 'Zone C'), ('zone', 'Zone D'), ('zone', 'Zone E'),
  ('team_member', 'Fazal'), ('team_member', 'Mussa'), ('team_member', 'Abdul'), ('team_member', 'Seif')
on conflict (kind, value) do nothing;