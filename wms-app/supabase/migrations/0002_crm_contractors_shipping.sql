-- Breezy Bay WMS - CRM, contractors, shipping
-- Run after 0001_init.sql.

-- ── CRM: lead status + follow-up + notes timeline on customers ─────────
alter table customers
  add column lead_status text not null default 'customer'
    check (lead_status in ('lead', 'prospect', 'customer', 'inactive')),
  add column follow_up_date date;

create table customer_notes (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id) on delete cascade,
  note text not null,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

alter table customer_notes enable row level security;
create policy "customer_notes: full access for authenticated" on customer_notes for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- ── Contractors (install crews / subcontractors) ────────────────────────
create table contractors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  contact_name text,
  email text,
  phone text,
  address text,
  trade text,
  status text not null default 'active' check (status in ('active', 'inactive')),
  notes text,
  created_at timestamptz not null default now()
);

alter table contractors enable row level security;
create policy "contractors: full access for authenticated" on contractors for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- Assign a contractor/install crew to a sales order (install job).
alter table sales_orders
  add column contractor_id uuid references contractors(id) on delete set null;

-- ── Shipping: package weight on items, used for ShipRush export ────────
alter table items
  add column weight_lbs numeric(10,2);
