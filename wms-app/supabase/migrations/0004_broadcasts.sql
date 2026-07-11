-- WMS - customer broadcasts (native outreach, no third-party marketing
-- platform needed): compose a message, send it to every customer with an
-- email on file. Sending itself happens in the send-broadcast Edge
-- Function (supabase/functions/send-broadcast) so the email provider's API
-- key never reaches the browser.

create table broadcasts (
  id uuid primary key default gen_random_uuid(),
  subject text not null,
  body text not null,
  status text not null default 'draft' check (status in ('draft', 'sending', 'sent', 'failed')),
  recipient_count integer,
  error_message text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

alter table broadcasts enable row level security;
create policy "broadcasts: full access for authenticated" on broadcasts
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

alter publication supabase_realtime add table broadcasts;
