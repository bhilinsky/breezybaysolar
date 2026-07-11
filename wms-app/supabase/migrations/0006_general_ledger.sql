-- WMS - general ledger: chart of accounts + double-entry journal entries,
-- auto-posted from invoices/bills. This is the "real books" layer the
-- earlier invoices/bills tables deliberately left out.

-- ── Chart of accounts ────────────────────────────────────────────────────
create table gl_accounts (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  type text not null check (type in ('asset', 'liability', 'equity', 'income', 'cogs', 'expense')),
  normal_balance text not null check (normal_balance in ('debit', 'credit')),
  -- Marks the handful of accounts auto-posting needs to find without the
  -- user having to configure a mapping; null for everything else.
  role text check (role in ('cash', 'ar', 'ap', 'sales_revenue', 'purchases_expense')),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create unique index gl_accounts_one_role_idx on gl_accounts (role) where role is not null;

insert into gl_accounts (code, name, type, normal_balance, role) values
  ('1000', 'Cash & Bank', 'asset', 'debit', 'cash'),
  ('1200', 'Inventory Asset', 'asset', 'debit', null),
  ('1300', 'Accounts Receivable', 'asset', 'debit', 'ar'),
  ('2000', 'Accounts Payable', 'liability', 'credit', 'ap'),
  ('3000', 'Owner''s Equity', 'equity', 'credit', null),
  ('3100', 'Retained Earnings', 'equity', 'credit', null),
  ('4000', 'Sales Revenue', 'income', 'credit', 'sales_revenue'),
  ('5000', 'Cost of Goods Sold', 'cogs', 'debit', null),
  ('6000', 'Operating Expenses', 'expense', 'debit', 'purchases_expense');

-- ── Journal entries ──────────────────────────────────────────────────────
create table journal_entries (
  id uuid primary key default gen_random_uuid(),
  entry_number text not null unique,
  entry_date date not null default current_date,
  memo text,
  reference text,
  status text not null default 'posted' check (status in ('posted', 'void')),
  -- 'manual' | 'invoice_sent' | 'invoice_paid' | 'bill_received' | 'bill_paid'
  source text not null default 'manual',
  source_id uuid,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

create table journal_entry_lines (
  id uuid primary key default gen_random_uuid(),
  journal_entry_id uuid not null references journal_entries(id) on delete cascade,
  gl_account_id uuid not null references gl_accounts(id) on delete restrict,
  debit numeric(12,2) not null default 0 check (debit >= 0),
  credit numeric(12,2) not null default 0 check (credit >= 0),
  memo text
);

create index journal_entry_lines_entry_idx on journal_entry_lines (journal_entry_id);
create index journal_entry_lines_account_idx on journal_entry_lines (gl_account_id);

-- Safety net: even a direct multi-row insert into journal_entry_lines (one
-- SQL statement, e.g. via supabase-js .insert([...])) must balance by the
-- time the transaction commits. Deferred so a transaction can insert lines
-- one at a time and only gets checked at COMMIT.
create or replace function check_je_balanced() returns trigger as $$
declare
  v_je_id uuid;
  v_dr numeric;
  v_cr numeric;
begin
  v_je_id := coalesce(new.journal_entry_id, old.journal_entry_id);
  select coalesce(sum(debit), 0), coalesce(sum(credit), 0)
    into v_dr, v_cr
    from journal_entry_lines where journal_entry_id = v_je_id;
  if v_dr <> v_cr then
    raise exception 'journal entry % does not balance: % debit vs % credit', v_je_id, v_dr, v_cr;
  end if;
  return null;
end;
$$ language plpgsql;

create constraint trigger je_lines_balanced
  after insert or update or delete on journal_entry_lines
  deferrable initially deferred
  for each row execute function check_je_balanced();

-- ── Atomic creation: the only supported way to create a journal entry ───
-- Takes the whole entry (header + lines) in one call so it's one
-- transaction, and validates balance itself before even touching the
-- trigger (which still guards direct table writes as a second layer).
create or replace function create_journal_entry(
  p_entry_date date,
  p_memo text,
  p_reference text,
  p_source text,
  p_source_id uuid,
  p_lines jsonb
) returns uuid as $$
declare
  v_id uuid;
  v_entry_number text;
  v_dr numeric;
  v_cr numeric;
begin
  select coalesce(sum((l->>'debit')::numeric), 0), coalesce(sum((l->>'credit')::numeric), 0)
    into v_dr, v_cr
    from jsonb_array_elements(p_lines) l;

  if jsonb_array_length(p_lines) < 2 then
    raise exception 'a journal entry needs at least two lines';
  end if;
  if v_dr <> v_cr then
    raise exception 'journal entry lines do not balance: % debit vs % credit', v_dr, v_cr;
  end if;
  if v_dr = 0 then
    raise exception 'journal entry must have a non-zero amount';
  end if;

  v_entry_number := 'JE-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(gen_random_uuid()::text, 1, 6));

  insert into journal_entries (entry_number, entry_date, memo, reference, source, source_id, created_by)
  values (v_entry_number, coalesce(p_entry_date, current_date), p_memo, p_reference,
          coalesce(p_source, 'manual'), p_source_id, auth.uid())
  returning id into v_id;

  insert into journal_entry_lines (journal_entry_id, gl_account_id, debit, credit, memo)
  select v_id, (l->>'gl_account_id')::uuid, coalesce((l->>'debit')::numeric, 0),
         coalesce((l->>'credit')::numeric, 0), l->>'memo'
  from jsonb_array_elements(p_lines) l;

  return v_id;
end;
$$ language plpgsql security definer set search_path = public;

-- ── Auto-posting: invoices/bills post themselves to the GL on status change ─
create or replace function post_invoice_journal() returns trigger as $$
declare
  v_ar uuid; v_rev uuid; v_cash uuid;
begin
  if new.status = 'sent' and (old.status is distinct from 'sent') then
    select id into v_ar from gl_accounts where role = 'ar';
    select id into v_rev from gl_accounts where role = 'sales_revenue';
    if v_ar is not null and v_rev is not null then
      perform create_journal_entry(
        current_date, 'Invoice ' || new.invoice_number || ' sent', new.invoice_number,
        'invoice_sent', new.id,
        jsonb_build_array(
          jsonb_build_object('gl_account_id', v_ar, 'debit', new.amount, 'credit', 0),
          jsonb_build_object('gl_account_id', v_rev, 'debit', 0, 'credit', new.amount)
        )
      );
    end if;
  elsif new.status = 'paid' and (old.status is distinct from 'paid') then
    select id into v_cash from gl_accounts where role = 'cash';
    select id into v_ar from gl_accounts where role = 'ar';
    if v_cash is not null and v_ar is not null then
      perform create_journal_entry(
        current_date, 'Payment received — ' || new.invoice_number, new.invoice_number,
        'invoice_paid', new.id,
        jsonb_build_array(
          jsonb_build_object('gl_account_id', v_cash, 'debit', new.amount, 'credit', 0),
          jsonb_build_object('gl_account_id', v_ar, 'debit', 0, 'credit', new.amount)
        )
      );
    end if;
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger invoices_post_journal
  after update on invoices
  for each row execute function post_invoice_journal();

create or replace function post_bill_journal() returns trigger as $$
declare
  v_ap uuid; v_exp uuid; v_cash uuid;
begin
  if new.status = 'received' and (old.status is distinct from 'received') then
    select id into v_exp from gl_accounts where role = 'purchases_expense';
    select id into v_ap from gl_accounts where role = 'ap';
    if v_exp is not null and v_ap is not null then
      perform create_journal_entry(
        current_date, 'Bill ' || new.bill_number || ' received', new.bill_number,
        'bill_received', new.id,
        jsonb_build_array(
          jsonb_build_object('gl_account_id', v_exp, 'debit', new.amount, 'credit', 0),
          jsonb_build_object('gl_account_id', v_ap, 'debit', 0, 'credit', new.amount)
        )
      );
    end if;
  elsif new.status = 'paid' and (old.status is distinct from 'paid') then
    select id into v_ap from gl_accounts where role = 'ap';
    select id into v_cash from gl_accounts where role = 'cash';
    if v_ap is not null and v_cash is not null then
      perform create_journal_entry(
        current_date, 'Bill paid — ' || new.bill_number, new.bill_number,
        'bill_paid', new.id,
        jsonb_build_array(
          jsonb_build_object('gl_account_id', v_ap, 'debit', new.amount, 'credit', 0),
          jsonb_build_object('gl_account_id', v_cash, 'debit', 0, 'credit', new.amount)
        )
      );
    end if;
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger bills_post_journal
  after update on bills
  for each row execute function post_bill_journal();

-- ── RLS ───────────────────────────────────────────────────────────────────
alter table gl_accounts enable row level security;
alter table journal_entries enable row level security;
alter table journal_entry_lines enable row level security;

create policy "gl_accounts: full access for authenticated" on gl_accounts
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "journal_entries: full access for authenticated" on journal_entries
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "journal_entry_lines: full access for authenticated" on journal_entry_lines
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

grant execute on function create_journal_entry(date, text, text, text, uuid, jsonb) to authenticated;

alter publication supabase_realtime add table gl_accounts, journal_entries, journal_entry_lines;
