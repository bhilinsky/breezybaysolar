-- WMS - Payroll: employee/contractor records and pay runs, posting to the
-- general ledger. Deliberately does NOT calculate tax withholding — that
-- varies by federal/state/local law and is its own regulated product
-- (Gusto/ADP/Zenefits territory). "Deductions" here is a single manual
-- number per pay line (whatever you've already calculated or are told to
-- withhold), booked to a Payroll Liabilities account for you to remit
-- separately — not computed by this app.

create table employees (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text,
  phone text,
  employee_type text not null default 'employee' check (employee_type in ('employee', 'contractor_1099')),
  pay_type text not null default 'hourly' check (pay_type in ('salary', 'hourly')),
  pay_rate numeric(12,2),
  start_date date,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table pay_runs (
  id uuid primary key default gen_random_uuid(),
  run_number text not null unique,
  pay_period_start date not null,
  pay_period_end date not null,
  pay_date date not null,
  status text not null default 'draft' check (status in ('draft', 'posted')),
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  posted_at timestamptz
);

create table pay_run_lines (
  id uuid primary key default gen_random_uuid(),
  pay_run_id uuid not null references pay_runs(id) on delete cascade,
  employee_id uuid not null references employees(id) on delete restrict,
  gross_pay numeric(12,2) not null check (gross_pay >= 0),
  deductions numeric(12,2) not null default 0 check (deductions >= 0),
  net_pay numeric(12,2) generated always as (gross_pay - deductions) stored,
  notes text
);

create index pay_run_lines_run_idx on pay_run_lines (pay_run_id);
create index pay_run_lines_employee_idx on pay_run_lines (employee_id);

-- New GL accounts + roles for payroll postings.
alter table gl_accounts drop constraint gl_accounts_role_check;
alter table gl_accounts add constraint gl_accounts_role_check check (
  role in ('cash', 'ar', 'ap', 'sales_revenue', 'purchases_expense', 'payroll_expense', 'payroll_liabilities')
);

insert into gl_accounts (code, name, type, normal_balance, role) values
  ('6100', 'Salaries & Wages', 'expense', 'debit', 'payroll_expense'),
  ('2400', 'Payroll Liabilities', 'liability', 'credit', 'payroll_liabilities');

-- Auto-post: Dr Salaries & Wages (gross), Cr Cash (net), Cr Payroll
-- Liabilities (deductions, if any) — the standard simplified payroll
-- entry; deductions land in a liability account for you to remit
-- separately rather than this app calculating or filing anything.
create or replace function post_payroll_journal() returns trigger as $$
declare
  v_expense uuid; v_cash uuid; v_liability uuid;
  v_gross numeric; v_net numeric; v_deductions numeric;
begin
  if new.status = 'posted' and (old.status is distinct from 'posted') then
    select coalesce(sum(gross_pay), 0), coalesce(sum(net_pay), 0), coalesce(sum(deductions), 0)
      into v_gross, v_net, v_deductions
      from pay_run_lines where pay_run_id = new.id;

    if v_gross > 0 then
      select id into v_expense from gl_accounts where role = 'payroll_expense';
      select id into v_cash from gl_accounts where role = 'cash';
      select id into v_liability from gl_accounts where role = 'payroll_liabilities';

      if v_expense is not null and v_cash is not null then
        if v_deductions > 0 and v_liability is not null then
          perform create_journal_entry(
            new.pay_date, 'Payroll — ' || new.run_number, new.run_number, 'payroll', new.id,
            jsonb_build_array(
              jsonb_build_object('gl_account_id', v_expense, 'debit', v_gross, 'credit', 0),
              jsonb_build_object('gl_account_id', v_cash, 'debit', 0, 'credit', v_net),
              jsonb_build_object('gl_account_id', v_liability, 'debit', 0, 'credit', v_deductions)
            )
          );
        else
          perform create_journal_entry(
            new.pay_date, 'Payroll — ' || new.run_number, new.run_number, 'payroll', new.id,
            jsonb_build_array(
              jsonb_build_object('gl_account_id', v_expense, 'debit', v_gross, 'credit', 0),
              jsonb_build_object('gl_account_id', v_cash, 'debit', 0, 'credit', v_gross)
            )
          );
        end if;
      end if;
    end if;
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger pay_runs_post_journal
  after update on pay_runs
  for each row execute function post_payroll_journal();

alter table employees enable row level security;
alter table pay_runs enable row level security;
alter table pay_run_lines enable row level security;

create policy "employees: full access for authenticated" on employees
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "pay_runs: full access for authenticated" on pay_runs
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "pay_run_lines: full access for authenticated" on pay_run_lines
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

alter publication supabase_realtime add table employees, pay_runs, pay_run_lines;
