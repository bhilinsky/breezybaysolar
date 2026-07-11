-- WMS - storefront, containers, business onboarding
-- Run this after 0001_init.sql on an existing project (or as part of a fresh setup).

-- ── Business profile (single row, set during first-run onboarding) ──────
create table business_profile (
  id boolean primary key default true check (id),
  business_type text not null check (
    business_type in ('retailer', 'service', 'contractor', 'manufacturer', 'distributor', 'web_store')
  ),
  business_name text,
  created_at timestamptz not null default now()
);

alter table business_profile enable row level security;
create policy "business_profile: full access for authenticated" on business_profile
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- ── Location types (warehouse racking vs. retail floor/display) ─────────
alter table locations add column type text not null default 'warehouse' check (
  type in ('warehouse', 'safe', 'display_case', 'storefront_floor', 'other')
);

-- ── Item barcodes (separate from SKU so a printed tag can be scanned) ───
alter table items add column barcode text unique;

-- ── Containers: racks/trays that move as a unit and carry their own code ─
create table containers (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  label text not null,
  location_id uuid references locations(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table inventory_levels add column container_id uuid references containers(id) on delete set null;

-- Replace the old (item_id, location_id) uniqueness with one that also
-- distinguishes container, while still treating "no container" as a single
-- slot per item/location (coalesce so NULL doesn't multiply rows).
alter table inventory_levels drop constraint inventory_levels_item_id_location_id_key;
create unique index inventory_levels_item_location_container_key
  on inventory_levels (item_id, location_id, coalesce(container_id, '00000000-0000-0000-0000-000000000000'::uuid));

-- ── Movement log: one row per scan-to-move event, for a full audit trail ─
create table movements (
  id uuid primary key default gen_random_uuid(),
  container_id uuid references containers(id) on delete set null,
  item_id uuid references items(id) on delete set null,
  quantity integer,
  from_location_id uuid references locations(id) on delete set null,
  to_location_id uuid not null references locations(id) on delete restrict,
  scan_code text not null,
  moved_by uuid references profiles(id),
  occurred_at timestamptz not null default now(),
  check (container_id is not null or item_id is not null)
);

alter table containers enable row level security;
alter table movements enable row level security;

create policy "containers: full access for authenticated" on containers
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "movements: full access for authenticated" on movements
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

alter publication supabase_realtime add table containers, movements;
