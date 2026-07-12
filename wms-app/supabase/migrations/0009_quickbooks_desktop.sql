-- WMS - QuickBooks Desktop Web Connector (QBWC) integration.
--
-- This is a different mechanism than the QuickBooks Online OAuth API
-- mentioned on the earlier integration roadmap: QuickBooks *Desktop* has no
-- REST API at all. The only way in is QBWC — a small Windows app QuickBooks
-- ships that periodically polls a SOAP web service you provide, described
-- by a .qwc XML file the user imports into it. See supabase/functions/
-- qbwc-soap for the actual SOAP endpoint this config points at.

create table qbwc_config (
  id boolean primary key default true check (id),
  app_name text not null default 'BreezyWorks QuickBooks Sync',
  username text not null default 'wms',
  password_hash text,
  owner_id uuid not null default gen_random_uuid(),
  file_id uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into qbwc_config (id) values (true);

alter table qbwc_config enable row level security;
-- Deliberately no policies — same pattern as salesforce_connection, so the
-- password hash is reachable only via the functions below or the
-- service-role key inside the Edge Function, never a direct client query.

create view qbwc_config_status as
  select app_name, username, owner_id, file_id, (password_hash is not null) as configured
  from qbwc_config
  where id = true;

grant select on qbwc_config_status to authenticated;

create or replace function set_qbwc_password(p_username text, p_password text) returns void as $$
  update qbwc_config
    set username = p_username, password_hash = crypt(p_password, gen_salt('bf')), updated_at = now()
    where id = true;
$$ language sql security definer set search_path = public, extensions;

grant execute on function set_qbwc_password(text, text) to authenticated;

-- Only the Edge Function (via the service-role key) should ever be able to
-- check a password — granting this to authenticated would let any
-- signed-in user brute-force it through RPC calls.
create or replace function verify_qbwc_password(p_username text, p_password text) returns boolean as $$
  select exists (
    select 1 from qbwc_config
    where id = true and username = p_username and password_hash is not null
      and password_hash = crypt(p_password, password_hash)
  );
$$ language sql security definer set search_path = public, extensions;

revoke execute on function verify_qbwc_password(text, text) from public, authenticated;
grant execute on function verify_qbwc_password(text, text) to service_role;

-- ── Sync sessions ─────────────────────────────────────────────────────────
-- QBWC's protocol is a stateful back-and-forth (authenticate -> repeated
-- sendRequestXML/receiveResponseXML -> closeConnection) but Edge Functions
-- are stateless between HTTP calls, so the session lives here instead —
-- keyed by the "ticket" QBWC round-trips on every call after authenticate.
create table qbwc_sessions (
  id uuid primary key default gen_random_uuid(),
  username text not null,
  step text not null default 'customers' check (step in ('customers', 'done')),
  status text not null default 'active' check (status in ('active', 'completed', 'error')),
  request_sent boolean not null default false,
  records_synced integer not null default 0,
  error_message text,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

alter table qbwc_sessions enable row level security;
create policy "qbwc_sessions: select for authenticated" on qbwc_sessions
  for select using (auth.role() = 'authenticated');
-- No insert/update/delete policy for authenticated — only the Edge
-- Function's service-role key writes sync state.

-- Track which customer came from which QuickBooks list entry, so re-syncs
-- update instead of duplicating (same pattern as salesforce_contact_id).
alter table customers add column quickbooks_list_id text;

alter publication supabase_realtime add table qbwc_sessions;
