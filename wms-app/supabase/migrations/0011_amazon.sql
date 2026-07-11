-- WMS - Amazon Selling Partner API (SP-API) integration scaffold.
--
-- Scope: OAuth connect (Login With Amazon) + pushing current stock
-- quantities to listings that ALREADY exist on Amazon. Deliberately not
-- creating new listings from scratch — that needs Amazon's per-category
-- product-type schemas (thousands of them, each with required attributes),
-- which can't be safely hardcoded without a real seller account to
-- validate against.

create table amazon_connection (
  id boolean primary key default true check (id),
  seller_id text,
  marketplace_id text,
  region text not null default 'na' check (region in ('na', 'eu', 'fe')),
  refresh_token text,
  access_token text,
  token_expires_at timestamptz,
  connected_by uuid references profiles(id),
  connected_at timestamptz,
  last_synced_at timestamptz
);

alter table amazon_connection enable row level security;
-- Deliberately no policies — tokens reachable only via the service-role
-- key inside the amazon-* Edge Functions, same pattern as Salesforce/QBWC.

create view amazon_status as
  select seller_id, marketplace_id, region, connected_at, last_synced_at, (access_token is not null) as connected
  from amazon_connection
  where id = true;

grant select on amazon_status to authenticated;

-- Amazon's own SKU for the listing, and the product-type code its catalog
-- API requires for updates (category-specific — has to be filled in by
-- hand per item since there's no safe way to infer it).
alter table items add column amazon_seller_sku text;
alter table items add column amazon_product_type text;
