-- WMS - Salesforce integration scaffold. Tokens are never readable by the
-- browser: salesforce_connection has no policy granting authenticated
-- access at all, so only server-side code using the service-role key (the
-- Edge Functions in supabase/functions/salesforce-*) can read or write it.
-- The client only ever sees the harmless salesforce_status view.

create table salesforce_connection (
  id boolean primary key default true check (id),
  instance_url text,
  access_token text,
  refresh_token text,
  token_expires_at timestamptz,
  connected_by uuid references profiles(id),
  connected_at timestamptz,
  last_synced_at timestamptz
);

alter table salesforce_connection enable row level security;
-- Deliberately no policies: RLS with zero policies denies all access to
-- non-superuser roles, including 'authenticated' — only the service role
-- (which bypasses RLS) can touch this table.

-- Owned by the migration role (effectively a superuser in Supabase), so
-- this view can read the locked-down table above while exposing none of
-- the secret columns — the standard Postgres view-as-security-boundary
-- pattern.
create view salesforce_status as
  select
    instance_url,
    connected_at,
    last_synced_at,
    (access_token is not null) as connected
  from salesforce_connection
  where id = true;

grant select on salesforce_status to authenticated;

-- Track which customer maps to which Salesforce Contact, so re-syncing
-- updates instead of duplicating.
alter table customers add column salesforce_contact_id text;
