-- WMS - accounting: invoices (money owed to you) and bills (money you owe).
-- Deliberately not a general ledger / chart of accounts / double-entry
-- system — this tracks what's outstanding and what's been paid, in the
-- same style as the rest of the app, not full bookkeeping.

create table invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_number text not null unique,
  customer_id uuid references customers(id) on delete set null,
  sales_order_id uuid references sales_orders(id) on delete set null,
  status text not null default 'draft' check (status in ('draft', 'sent', 'paid', 'cancelled')),
  amount numeric(12,2) not null check (amount >= 0),
  due_date date,
  notes text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  paid_at timestamptz
);

create table bills (
  id uuid primary key default gen_random_uuid(),
  bill_number text not null unique,
  supplier_id uuid references suppliers(id) on delete set null,
  purchase_order_id uuid references purchase_orders(id) on delete set null,
  status text not null default 'draft' check (status in ('draft', 'received', 'paid', 'cancelled')),
  amount numeric(12,2) not null check (amount >= 0),
  due_date date,
  notes text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  paid_at timestamptz
);

alter table invoices enable row level security;
alter table bills enable row level security;

create policy "invoices: full access for authenticated" on invoices
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "bills: full access for authenticated" on bills
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

alter publication supabase_realtime add table invoices, bills;
