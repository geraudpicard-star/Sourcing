-- Extend companies with address details (complement / CEDEX) + dirigeants cache from INPI RNE.

alter table public.companies
  add column if not exists complement_adresse text,
  add column if not exists cedex              text,
  add column if not exists dirigeants         jsonb,
  add column if not exists dirigeants_fetched_at timestamptz;

create index if not exists companies_dirigeants_fetched_idx
  on public.companies (dirigeants_fetched_at);
