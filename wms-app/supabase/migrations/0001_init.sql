-- Breezy Bay WMS - initial schema
-- Run this in the Supabase SQL editor (or via `supabase db push`) on a fresh project.

create extension if not exists "pgcrypto";

-- ── Profiles (one per authenticated user) ──────────────────────────────
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  role text not null default 'staff' check (role in ('admin', 'staff')),
  created_at timestamptz not null default now()
);

create function handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, new.raw_user_meta_data->>'full_name');
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

-- ── Catalog ─────────────────────────────────────────────────────────────
create table categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

create table locations (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text,
  created_at timestamptz not null default now()
);

create table items (
  id uuid primary key default gen_random_uuid(),
  sku text not null unique,
  name text not null,
  description text,
  category_id uuid references categories(id) on delete set null,
  unit text not null default 'each',
  reorder_point integer not null default 0,
  default_cost numeric(12,2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table inventory_levels (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references items(id) on delete cascade,
  location_id uuid not null references locations(id) on delete cascade,
  quantity integer not null default 0,
  updated_at timestamptz not null default now(),
  unique (item_id, location_id)
);

-- ── Suppliers / Purchase orders (receiving) ─────────────────────────────
create table suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  contact_name text,
  email text,
  phone text,
  address text,
  created_at timestamptz not null default now()
);

create table purchase_orders (
  id uuid primary key default gen_random_uuid(),
  po_number text not null unique,
  supplier_id uuid references suppliers(id) on delete set null,
  status text not null default 'draft' check (status in ('draft', 'ordered', 'received', 'cancelled')),
  expected_date date,
  notes text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table purchase_order_items (
  id uuid primary key default gen_random_uuid(),
  purchase_order_id uuid not null references purchase_orders(id) on delete cascade,
  item_id uuid not null references items(id) on delete restrict,
  quantity_ordered integer not null check (quantity_ordered > 0),
  quantity_received integer not null default 0,
  unit_cost numeric(12,2)
);

-- ── Customers / Sales orders (outgoing) ─────────────────────────────────
create table customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  contact_name text,
  email text,
  phone text,
  address text,
  created_at timestamptz not null default now()
);

create table sales_orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique,
  customer_id uuid references customers(id) on delete set null,
  status text not null default 'draft' check (status in ('draft', 'confirmed', 'fulfilled', 'cancelled')),
  notes text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table sales_order_items (
  id uuid primary key default gen_random_uuid(),
  sales_order_id uuid not null references sales_orders(id) on delete cascade,
  item_id uuid not null references items(id) on delete restrict,
  location_id uuid references locations(id) on delete set null,
  quantity_ordered integer not null check (quantity_ordered > 0),
  quantity_fulfilled integer not null default 0,
  unit_price numeric(12,2)
);

-- ── Activity log ─────────────────────────────────────────────────────────
create table activity_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  details jsonb,
  created_at timestamptz not null default now()
);

-- ── Low stock view ───────────────────────────────────────────────────────
create view low_stock_items as
select
  i.id,
  i.sku,
  i.name,
  i.reorder_point,
  coalesce(sum(il.quantity), 0) as total_quantity
from items i
left join inventory_levels il on il.item_id = i.id
group by i.id, i.sku, i.name, i.reorder_point
having coalesce(sum(il.quantity), 0) <= i.reorder_point;

-- ── Row level security: any authenticated user has full access ─────────
alter table profiles enable row level security;
alter table categories enable row level security;
alter table locations enable row level security;
alter table items enable row level security;
alter table inventory_levels enable row level security;
alter table suppliers enable row level security;
alter table purchase_orders enable row level security;
alter table purchase_order_items enable row level security;
alter table customers enable row level security;
alter table sales_orders enable row level security;
alter table sales_order_items enable row level security;
alter table activity_log enable row level security;

create policy "profiles: read own or any authenticated" on profiles for select using (auth.role() = 'authenticated');
create policy "profiles: update own" on profiles for update using (auth.uid() = id);

create policy "categories: full access for authenticated" on categories for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "locations: full access for authenticated" on locations for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "items: full access for authenticated" on items for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "inventory_levels: full access for authenticated" on inventory_levels for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "suppliers: full access for authenticated" on suppliers for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "purchase_orders: full access for authenticated" on purchase_orders for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "purchase_order_items: full access for authenticated" on purchase_order_items for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "customers: full access for authenticated" on customers for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "sales_orders: full access for authenticated" on sales_orders for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "sales_order_items: full access for authenticated" on sales_order_items for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "activity_log: full access for authenticated" on activity_log for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- ── Realtime: let the dashboard/inventory views update live across devices ─
alter publication supabase_realtime add table inventory_levels, sales_orders, purchase_orders, items;
