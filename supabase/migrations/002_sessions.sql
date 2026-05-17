-- Saved-search sessions: each "Sauvegarder" click groups the selected companies
-- under a session row that captures the filters used and the timestamp.

create extension if not exists "pgcrypto";

create table if not exists public.search_sessions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  label       text,
  filters     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists search_sessions_user_idx
  on public.search_sessions(user_id, created_at desc);

-- Many-to-many: a SIREN can belong to several sessions (e.g. saved twice
-- by different searches). Cascade on session delete removes the link only,
-- the canonical company row in `companies` is preserved.
create table if not exists public.session_companies (
  session_id  uuid not null references public.search_sessions(id) on delete cascade,
  siren       text not null references public.companies(siren)     on delete cascade,
  primary key (session_id, siren)
);

create index if not exists session_companies_siren_idx on public.session_companies(siren);

alter table public.search_sessions   enable row level security;
alter table public.session_companies enable row level security;

drop policy if exists "search_sessions_read"   on public.search_sessions;
create policy "search_sessions_read"   on public.search_sessions for select to authenticated using (true);

drop policy if exists "search_sessions_insert" on public.search_sessions;
create policy "search_sessions_insert" on public.search_sessions for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "search_sessions_update" on public.search_sessions;
create policy "search_sessions_update" on public.search_sessions for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "search_sessions_delete" on public.search_sessions;
create policy "search_sessions_delete" on public.search_sessions for delete to authenticated using (user_id = auth.uid());

drop policy if exists "session_companies_read" on public.session_companies;
create policy "session_companies_read" on public.session_companies for select to authenticated using (true);

drop policy if exists "session_companies_insert" on public.session_companies;
create policy "session_companies_insert" on public.session_companies for insert to authenticated
  with check (exists (
    select 1 from public.search_sessions s where s.id = session_id and s.user_id = auth.uid()
  ));

drop policy if exists "session_companies_delete" on public.session_companies;
create policy "session_companies_delete" on public.session_companies for delete to authenticated
  using (exists (
    select 1 from public.search_sessions s where s.id = session_id and s.user_id = auth.uid()
  ));

-- One-time backfill: for any existing saved companies that have no session yet,
-- create a single "Anciens enregistrements" session per owner and link them.
do $$
declare
  rec record;
  s_id uuid;
begin
  for rec in
    select saved_by, min(saved_at) as first_saved
    from public.companies c
    where saved_by is not null
      and not exists (select 1 from public.session_companies sc where sc.siren = c.siren)
    group by saved_by
  loop
    insert into public.search_sessions (user_id, label, filters, created_at)
    values (rec.saved_by, 'Anciens enregistrements', '{}'::jsonb, rec.first_saved)
    returning id into s_id;

    insert into public.session_companies (session_id, siren)
    select s_id, siren
    from public.companies c
    where c.saved_by = rec.saved_by
      and not exists (select 1 from public.session_companies sc where sc.siren = c.siren);
  end loop;
end $$;
