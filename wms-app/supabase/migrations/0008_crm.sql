-- WMS - native CRM: a logged activity timeline and a sales pipeline per
-- customer, so contact/opportunity tracking works without needing real
-- Salesforce connected (that integration, from 0007, stays available
-- alongside this rather than being replaced by it).

create table crm_activities (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id) on delete cascade,
  type text not null check (type in ('call', 'email', 'meeting', 'note')),
  subject text not null,
  notes text,
  occurred_at timestamptz not null default now(),
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

create index crm_activities_customer_idx on crm_activities (customer_id, occurred_at desc);

create table opportunities (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id) on delete cascade,
  name text not null,
  stage text not null default 'prospecting' check (stage in ('prospecting', 'qualified', 'proposal', 'won', 'lost')),
  value numeric(12,2),
  expected_close_date date,
  notes text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index opportunities_customer_idx on opportunities (customer_id);

alter table crm_activities enable row level security;
alter table opportunities enable row level security;

create policy "crm_activities: full access for authenticated" on crm_activities
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "opportunities: full access for authenticated" on opportunities
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

alter publication supabase_realtime add table crm_activities, opportunities;
