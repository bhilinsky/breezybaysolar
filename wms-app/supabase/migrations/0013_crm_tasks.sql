-- WMS - CRM tasks: the follow-up/reminder layer that was missing
-- alongside crm_activities (what happened) and opportunities (the deal) —
-- what needs to happen next, and by when.

create table crm_tasks (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id) on delete cascade,
  opportunity_id uuid references opportunities(id) on delete set null,
  title text not null,
  due_date date,
  status text not null default 'open' check (status in ('open', 'done')),
  notes text,
  assigned_to uuid references profiles(id),
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index crm_tasks_customer_idx on crm_tasks (customer_id, due_date);

alter table crm_tasks enable row level security;
create policy "crm_tasks: full access for authenticated" on crm_tasks
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

alter publication supabase_realtime add table crm_tasks;
