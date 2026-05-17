import "server-only";

import { createHash } from "node:crypto";

import { fetchInpiCompany, InpiApiError } from "@/lib/api/inpi";
import { InpiAuthError } from "@/lib/api/inpi-auth";
import {
  createSupabaseServerClient,
  createSupabaseServiceRoleClient,
} from "@/lib/supabase/server";
import type {
  Company,
  CompanyDetail,
  Dirigeant,
  SavedSessionDetail,
  SavedSessionSummary,
  SearchFilters,
  SearchResult,
} from "@/types/company";
import type { Database, Json } from "@/types/database";

const CACHE_TTL_MS = 1000 * 60 * 60 * 24; // 24h

type CompanyRow = Database["public"]["Tables"]["companies"]["Row"];
type CompanyInsert = Database["public"]["Tables"]["companies"]["Insert"];

export class CompaniesDbError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CompaniesDbError";
  }
}

/**
 * Save a batch of companies and link them to a new "session" row that captures
 * the filters used for traceability. Returns the new session id.
 */
export async function saveCompaniesAsSession(
  companies: Company[],
  filters: Partial<SearchFilters>,
  label: string | null,
): Promise<{ sessionId: string; saved: number }> {
  if (companies.length === 0) {
    throw new CompaniesDbError("Aucune entreprise à sauvegarder");
  }

  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new CompaniesDbError("Not authenticated");

  // 1. Upsert companies (canonical rows)
  const rows: CompanyInsert[] = companies.map((c) => ({
    siren: c.siren,
    siret: c.siret,
    denomination: c.denomination,
    legal_form: c.legalForm,
    naf_code: c.nafCode,
    naf_label: c.nafLabel,
    creation_date: c.creationDate,
    age_years: c.ageYears,
    employee_range: c.employeeRange,
    employee_range_code: c.employeeRangeCode,
    active: c.active,
    street: c.address.street,
    complement_adresse: c.address.complement,
    cedex: c.address.cedex,
    postal_code: c.address.postalCode,
    city: c.address.city,
    department: c.address.department,
    source: c.source,
    fetched_at: c.fetchedAt,
    saved_by: user.id,
  }));

  const upsertRes = await supabase
    .from("companies")
    .upsert(rows, { onConflict: "siren" });
  if (upsertRes.error) throw new CompaniesDbError(upsertRes.error.message);

  // 2. Create the session row
  const sessionInsert = await supabase
    .from("search_sessions")
    .insert({
      user_id: user.id,
      label,
      filters: filters as unknown as Json,
    })
    .select("id")
    .single();
  if (sessionInsert.error) throw new CompaniesDbError(sessionInsert.error.message);
  const sessionId = sessionInsert.data.id;

  // 3. Link companies to the session (junction)
  const links = companies.map((c) => ({ session_id: sessionId, siren: c.siren }));
  const linkRes = await supabase.from("session_companies").upsert(links);
  if (linkRes.error) throw new CompaniesDbError(linkRes.error.message);

  return { sessionId, saved: companies.length };
}

export async function listSessions(): Promise<SavedSessionSummary[]> {
  const supabase = createSupabaseServerClient();
  const { data: sessions, error } = await supabase
    .from("search_sessions")
    .select("id, label, filters, created_at")
    .order("created_at", { ascending: false });
  if (error) throw new CompaniesDbError(error.message);
  if (!sessions || sessions.length === 0) return [];

  // Fetch counts in one query.
  const { data: links, error: linkErr } = await supabase
    .from("session_companies")
    .select("session_id")
    .in(
      "session_id",
      sessions.map((s) => s.id),
    );
  if (linkErr) throw new CompaniesDbError(linkErr.message);

  const counts = new Map<string, number>();
  for (const link of links ?? []) {
    counts.set(link.session_id, (counts.get(link.session_id) ?? 0) + 1);
  }

  return sessions.map((s) => ({
    id: s.id,
    label: s.label,
    filters: (s.filters ?? {}) as Partial<SearchFilters>,
    createdAt: s.created_at,
    count: counts.get(s.id) ?? 0,
  }));
}

export async function getSessionWithCompanies(
  sessionId: string,
): Promise<SavedSessionDetail | null> {
  const supabase = createSupabaseServerClient();
  const sessionRes = await supabase
    .from("search_sessions")
    .select("id, label, filters, created_at")
    .eq("id", sessionId)
    .maybeSingle();
  if (sessionRes.error) throw new CompaniesDbError(sessionRes.error.message);
  if (!sessionRes.data) return null;

  const linksRes = await supabase
    .from("session_companies")
    .select("siren")
    .eq("session_id", sessionId);
  if (linksRes.error) throw new CompaniesDbError(linksRes.error.message);
  const sirens = (linksRes.data ?? []).map((l) => l.siren);

  let companies: Company[] = [];
  if (sirens.length > 0) {
    const cRes = await supabase
      .from("companies")
      .select("*")
      .in("siren", sirens);
    if (cRes.error) throw new CompaniesDbError(cRes.error.message);
    companies = (cRes.data ?? []).map(rowToCompany);
  }

  return {
    id: sessionRes.data.id,
    label: sessionRes.data.label,
    filters: (sessionRes.data.filters ?? {}) as Partial<SearchFilters>,
    createdAt: sessionRes.data.created_at,
    count: companies.length,
    companies,
  };
}

export async function renameSession(
  sessionId: string,
  label: string | null,
): Promise<void> {
  const supabase = createSupabaseServerClient();
  const { error } = await supabase
    .from("search_sessions")
    .update({ label })
    .eq("id", sessionId);
  if (error) throw new CompaniesDbError(error.message);
}

export async function deleteSession(sessionId: string): Promise<void> {
  const supabase = createSupabaseServerClient();
  const { error } = await supabase
    .from("search_sessions")
    .delete()
    .eq("id", sessionId);
  if (error) throw new CompaniesDbError(error.message);
}

/** Flat list of every canonical company row — used for the "Export tout" CSV. */
export async function listAllSavedCompanies(): Promise<Company[]> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("companies")
    .select("*")
    .order("saved_at", { ascending: false })
    .limit(10000);
  if (error) throw new CompaniesDbError(error.message);
  return (data ?? []).map(rowToCompany);
}

/** Existence check used by the search route to mark known SIRENs. */
export async function getSavedSirens(sirens: string[]): Promise<Set<string>> {
  if (sirens.length === 0) return new Set();
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("companies")
    .select("siren")
    .in("siren", sirens);
  if (error) throw new CompaniesDbError(error.message);
  return new Set((data ?? []).map((r) => r.siren));
}

/** Stable cache key for a filter set. */
export function searchCacheKey(filters: SearchFilters): string {
  const normalized = {
    nafCode: filters.nafCode ?? null,
    department: filters.department ?? null,
    commune: filters.commune?.toUpperCase() ?? null,
    minAgeYears: filters.minAgeYears ?? null,
    employeeRangeCodes: [...(filters.employeeRangeCodes ?? [])].sort(),
    activeOnly: filters.activeOnly,
    page: filters.page,
    pageSize: filters.pageSize,
  };
  return createHash("sha1")
    .update(JSON.stringify(normalized))
    .digest("hex");
}

export async function readCache(
  key: string,
): Promise<Pick<SearchResult, "companies" | "total"> | null> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from("search_cache")
    .select("payload, total, expires_at")
    .eq("key", key)
    .maybeSingle();

  if (error || !data) return null;
  if (new Date(data.expires_at).getTime() < Date.now()) return null;

  return {
    companies: data.payload as unknown as Company[],
    total: data.total,
  };
}

export async function writeCache(
  key: string,
  companies: Company[],
  total: number,
): Promise<void> {
  const supabase = createSupabaseServiceRoleClient();
  const expiresAt = new Date(Date.now() + CACHE_TTL_MS).toISOString();
  await supabase.from("search_cache").upsert(
    {
      key,
      payload: companies as unknown as Json,
      total,
      expires_at: expiresAt,
    },
    { onConflict: "key" },
  );
}

function rowToCompany(r: CompanyRow): Company {
  return {
    siren: r.siren,
    siret: r.siret,
    denomination: r.denomination,
    legalForm: r.legal_form,
    nafCode: r.naf_code,
    nafLabel: r.naf_label,
    creationDate: r.creation_date,
    ageYears: r.age_years,
    employeeRange: r.employee_range,
    employeeRangeCode: r.employee_range_code,
    active: r.active,
    address: {
      street: r.street,
      complement: r.complement_adresse,
      cedex: r.cedex,
      postalCode: r.postal_code,
      city: r.city,
      department: r.department,
    },
    source: r.source as "insee",
    fetchedAt: r.fetched_at,
  };
}

const DIRIGEANTS_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export interface DirigeantsResult {
  dirigeants: Dirigeant[];
  fetchedAt: string;
  fromCache: boolean;
}

/**
 * Fetch the dirigeants for a SIREN. If the company row exists in DB, we
 * opportunistically read/write a 30-day cache there. Otherwise we just go
 * to INPI directly (useful for not-yet-saved search results).
 */
export async function getOrFetchDirigeants(
  siren: string,
): Promise<DirigeantsResult> {
  const supabase = createSupabaseServerClient();
  const { data: row } = await supabase
    .from("companies")
    .select("dirigeants, dirigeants_fetched_at")
    .eq("siren", siren)
    .maybeSingle();

  const lastFetch = row?.dirigeants_fetched_at
    ? new Date(row.dirigeants_fetched_at).getTime()
    : 0;
  const fresh = lastFetch > 0 && Date.now() - lastFetch < DIRIGEANTS_TTL_MS;

  if (fresh && Array.isArray(row?.dirigeants) && row.dirigeants_fetched_at) {
    return {
      dirigeants: row.dirigeants as unknown as Dirigeant[],
      fetchedAt: row.dirigeants_fetched_at,
      fromCache: true,
    };
  }

  const inpi = await fetchInpiCompany(siren);
  const now = new Date().toISOString();

  if (row) {
    // Row exists → persist for next time.
    await supabase
      .from("companies")
      .update({
        dirigeants: inpi.dirigeants as unknown as Json,
        dirigeants_fetched_at: now,
      })
      .eq("siren", siren);
  }

  return {
    dirigeants: inpi.dirigeants,
    fetchedAt: now,
    fromCache: false,
  };
}

// Keep CompanyDetail type alias exported for compatibility (unused for now).
export type { CompanyDetail };
