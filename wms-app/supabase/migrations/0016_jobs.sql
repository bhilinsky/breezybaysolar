-- BreezyWorks - Jobs: the core hub for service/contractor work (install,
-- repair, maintenance, consultation calls) — a customer, a site, a status
-- pipeline, and the materials needed. Quotes, change orders, time
-- tracking, and jobsite photos hang off this in later migrations.

create table jobs (
  id uuid primary key default gen_random_uuid(),
  job_number text not null unique,
  customer_id uuid references customers(id) on delete set null,
  site_address text,
  job_type text not null default 'general' check (
    job_type in ('general', 'installation', 'repair', 'maintenance', 'consultation')
  ),
  status text not null default 'new' check (
    status in ('new', 'quoted', 'scheduled', 'in_progress', 'completed', 'cancelled')
  ),
  start_date date,
  target_end_date date,
  notes text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index jobs_status_idx on jobs (status, start_date);
create index jobs_customer_idx on jobs (customer_id);

create table job_materials (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references jobs(id) on delete cascade,
  item_id uuid not null references items(id) on delete restrict,
  quantity numeric(12,2) not null check (quantity > 0),
  ordered boolean not null default false,
  notes text
);

create index job_materials_job_idx on job_materials (job_id);

alter table jobs enable row level security;
alter table job_materials enable row level security;

create policy "jobs: full access for authenticated" on jobs
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "job_materials: full access for authenticated" on job_materials
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

alter publication supabase_realtime add table jobs, job_materials;
