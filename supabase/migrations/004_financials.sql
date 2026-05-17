-- Sprint "Sourcing avancé" — enrichissement INPI financiers + dirigeant principal.

alter table public.companies
  add column if not exists financials             jsonb,
  add column if not exists financials_fetched_at  timestamptz,
  add column if not exists no_public_accounts     boolean default false,
  add column if not exists principal_dirigeant    jsonb;

-- Index pour savoir rapidement ce qui est à (re)enrichir
create index if not exists companies_financials_fetched_idx
  on public.companies (financials_fetched_at);

-- Index pour requêter par date de naissance du dirigeant principal
-- (utile pour les filtres "âge cédant ≥ X")
create index if not exists companies_principal_birth_idx
  on public.companies ((principal_dirigeant->>'dateNaissance'));
