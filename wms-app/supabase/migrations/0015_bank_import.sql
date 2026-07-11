-- WMS - Bank transaction import: upload a CSV export from your bank,
-- review each row, and categorize it against a GL account to post a
-- journal entry. This is a manual/CSV feed, not a live bank connection —
-- see README for why (a live feed needs a bank-data aggregator like
-- Plaid, which requires your own developer account and has real
-- per-connection costs, so it's a deliberate separate step, not bundled
-- in here).

create table bank_transactions (
  id uuid primary key default gen_random_uuid(),
  transaction_date date not null,
  description text not null,
  amount numeric(12,2) not null,
  external_ref text,
  status text not null default 'unreviewed' check (status in ('unreviewed', 'categorized', 'ignored')),
  gl_account_id uuid references gl_accounts(id),
  journal_entry_id uuid references journal_entries(id),
  imported_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

create index bank_transactions_status_idx on bank_transactions (status, transaction_date desc);

alter table bank_transactions enable row level security;
create policy "bank_transactions: full access for authenticated" on bank_transactions
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

alter publication supabase_realtime add table bank_transactions;
