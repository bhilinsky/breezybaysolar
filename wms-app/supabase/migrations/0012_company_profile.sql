-- WMS - company profile: what the business already uses, captured during
-- onboarding so it can inform which integrations/features get surfaced
-- (e.g. "you told us you use Salesforce" on the Integrations page) and,
-- for employee counts, whether Payroll is relevant at all.

alter table business_profile
  add column crm_tools text[] not null default '{}'::text[],
  add column crm_other text,
  add column shipping_services text[] not null default '{}'::text[],
  add column shipping_other text,
  add column approx_employees integer,
  add column has_1099_contractors boolean;
