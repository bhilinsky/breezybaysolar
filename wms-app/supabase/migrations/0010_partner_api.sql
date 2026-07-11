-- WMS - Partner Data API: lets an outside system (a marketplace, something
-- hosted on AWS, anything with an HTTPS client) read current inventory
-- and/or customers over a plain authenticated REST endpoint
-- (supabase/functions/partner-api). This doesn't need to run on AWS to be
-- reachable from AWS — it's a normal HTTPS + API key API, callable from
-- anywhere.

create table partner_api_keys (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  scopes text[] not null default array['inventory']::text[],
  key_hash text not null unique,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);

alter table partner_api_keys enable row level security;
-- Deliberately no policies — key_hash must never be directly queryable,
-- same pattern as qbwc_config/salesforce_connection.

create view partner_api_keys_status as
  select id, label, scopes, created_at, last_used_at, revoked_at
  from partner_api_keys;

grant select on partner_api_keys_status to authenticated;

-- Returns the plaintext key exactly once, at creation — same convention as
-- Stripe/GitHub-style API keys. It is not retrievable again after this.
create or replace function create_partner_api_key(p_label text, p_scopes text[]) returns text as $$
declare
  v_key text;
begin
  v_key := 'wms_' || encode(gen_random_bytes(24), 'hex');
  insert into partner_api_keys (label, scopes, key_hash, created_by)
  values (p_label, p_scopes, encode(digest(v_key, 'sha256'), 'hex'), auth.uid());
  return v_key;
end;
$$ language plpgsql security definer set search_path = public, extensions;

grant execute on function create_partner_api_key(text, text[]) to authenticated;

create or replace function revoke_partner_api_key(p_id uuid) returns void as $$
  update partner_api_keys set revoked_at = now() where id = p_id;
$$ language sql security definer set search_path = public;

grant execute on function revoke_partner_api_key(uuid) to authenticated;

-- Only the Edge Function (service role) can verify a presented key — this
-- both reads a secret comparison and marks last_used_at, neither of which
-- authenticated should be able to trigger directly.
create or replace function verify_partner_api_key(p_key text, p_scope text) returns boolean as $$
declare
  v_row partner_api_keys%rowtype;
begin
  select * into v_row from partner_api_keys
    where key_hash = encode(digest(p_key, 'sha256'), 'hex') and revoked_at is null;
  if not found or not (p_scope = any(v_row.scopes)) then
    return false;
  end if;
  update partner_api_keys set last_used_at = now() where id = v_row.id;
  return true;
end;
$$ language plpgsql security definer set search_path = public, extensions;

revoke execute on function verify_partner_api_key(text, text) from public, authenticated;
grant execute on function verify_partner_api_key(text, text) to service_role;
