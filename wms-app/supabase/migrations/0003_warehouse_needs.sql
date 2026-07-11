-- WMS - explicit warehouse/bin-location preferences, asked during onboarding
-- rather than inferred purely from business type.

alter table business_profile
  add column needs_warehouse boolean not null default true,
  add column needs_bin_locations boolean not null default false;

alter table locations
  add column bin_code text;
