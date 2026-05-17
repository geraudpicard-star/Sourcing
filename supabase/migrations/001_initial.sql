-- Companies table — sourced (currently) from INSEE Sirene.
-- SIREN is the stable identifier across establishments.
create table if not exists public.companies (
  siren                text primary key,
  siret                text,
  denomination         text not null,
  legal_form           text,
  naf_code             text,
  naf_label            text,
  creation_date        date,
  age_years            integer,
  employee_range       text,
  employee_range_code  text,
  active               boolean not null default true,
  street               text,
  postal_code          text,
  city                 text,
  department           text,
  source               text not null default 'insee',
  fetched_at           timestamptz not null default now(),
  saved_by             uuid references auth.users(id) on delete set null,
  saved_at             timestamptz not null default now(),
  raw                  jsonb
);

create index if not exists companies_naf_code_idx     on public.companies (naf_code);
create index if not exists companies_department_idx   on public.companies (department);
create index if not exists companies_creation_date_idx on public.companies (creation_date);
create index if not exists companies_employee_idx     on public.companies (employee_range_code);

-- Server-side search cache. Avoids re-hitting INSEE for identical recent queries.
create table if not exists public.search_cache (
  key         text primary key,
  payload     jsonb not null,
  total       integer not null,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null
);

create index if not exists search_cache_expires_idx on public.search_cache (expires_at);

-- RLS: authenticated users can read all companies; only the saver can update/delete their own row.
alter table public.companies   enable row level security;
alter table public.search_cache enable row level security;

drop policy if exists "companies_read_authenticated" on public.companies;
create policy "companies_read_authenticated"
  on public.companies for select
  to authenticated
  using (true);

drop policy if exists "companies_insert_authenticated" on public.companies;
create policy "companies_insert_authenticated"
  on public.companies for insert
  to authenticated
  with check (saved_by = auth.uid());

drop policy if exists "companies_update_owner" on public.companies;
create policy "companies_update_owner"
  on public.companies for update
  to authenticated
  using (saved_by = auth.uid())
  with check (saved_by = auth.uid());

drop policy if exists "companies_delete_owner" on public.companies;
create policy "companies_delete_owner"
  on public.companies for delete
  to authenticated
  using (saved_by = auth.uid());

-- search_cache is server-side only (service role). No policies needed beyond RLS being on.
