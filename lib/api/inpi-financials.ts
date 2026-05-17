import "server-only";

import { getInpiToken, InpiAuthError } from "@/lib/api/inpi-auth";
import { InpiApiError } from "@/lib/api/inpi";
import type { FinancialExercise, Financials } from "@/types/company";

const BASE_URL =
  process.env.INPI_BASE_URL ?? "https://registre-national-entreprises.inpi.fr/api";

/**
 * Codes liasses fiscales we care about, with priority order across
 * column families (m1..m4). For a given bilan we pick the FIRST non-zero
 * value across the candidate (code, columns) pairs — this is a robust
 * heuristic that works across typeBilan = N | S | K | etc.
 *
 * Reference: INPI bilans saisis use the standard "codes liasses fiscales"
 * (cerfa 2050 et suivants).
 */
const FIELD_CODES: Record<keyof Pick<FinancialExercise, "ca" | "netResult" | "equity" | "employees">, string[]> = {
  // Chiffre d'affaires net (compte de résultat)
  ca: ["FL", "FR", "210", "232"],
  // Bénéfice ou perte (résultat net)
  netResult: ["HN", "DI", "310"],
  // Total capitaux propres (bilan passif)
  equity: ["DL", "120"],
  // Effectif moyen du personnel (annexe)
  employees: ["YP"],
};

interface InpiBilanSaisi {
  id: string;
  siren: string;
  denomination?: string;
  dateDepot?: string;
  dateCloture?: string;
  typeBilan?: string;
  confidentiality?: string;
  deleted?: boolean;
  bilanSaisi?: {
    bilan?: {
      identite?: {
        dureeExerciceN?: string;
        dateClotureExercice?: string;
        codeDevise?: string;
      };
      detail?: {
        pages?: Array<{
          numero?: number;
          liasses?: Array<{
            code?: string;
            m1?: string;
            m2?: string;
            m3?: string;
            m4?: string;
          }>;
        }>;
      };
    };
  };
}

interface InpiAttachmentsResponse {
  bilans?: unknown[];
  bilansSaisis?: InpiBilanSaisi[];
}

export interface InpiFinancialsResult {
  financials: Financials | null;
  noPublicAccounts: boolean;
}

/**
 * Fetch and normalize the comptes annuels for a SIREN.
 * - 404 / empty → returns { financials: null, noPublicAccounts: true }
 * - confidentiality marks all bilans as "Confidentiel" → noPublicAccounts: true
 */
export async function fetchInpiFinancials(
  siren: string,
): Promise<InpiFinancialsResult> {
  const cleanSiren = siren.replace(/\D/g, "");
  if (cleanSiren.length !== 9) {
    throw new InpiApiError(`SIREN invalide : ${siren}`, 400);
  }

  const token = await getInpiToken();
  const res = await fetch(`${BASE_URL}/companies/${cleanSiren}/attachments`, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    cache: "no-store",
  });

  if (res.status === 404) {
    return { financials: null, noPublicAccounts: true };
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new InpiApiError(
      `INPI attachments failed for SIREN ${cleanSiren} (${res.status})`,
      res.status,
      body,
    );
  }

  const data = (await res.json()) as InpiAttachmentsResponse;
  const saisis = (data.bilansSaisis ?? []).filter((b) => !b.deleted);

  if (saisis.length === 0) {
    return { financials: null, noPublicAccounts: true };
  }

  // Drop confidentials, keep only valid bilans saisis.
  const usable = saisis.filter(
    (b) => (b.confidentiality ?? "").toLowerCase() !== "confidentiel",
  );
  if (usable.length === 0) {
    return { financials: null, noPublicAccounts: true };
  }

  // Sort newest first by closing date.
  usable.sort((a, b) =>
    (b.dateCloture ?? "").localeCompare(a.dateCloture ?? ""),
  );

  const exercices: FinancialExercise[] = [];
  // Keep the 3 most recent published.
  for (const b of usable.slice(0, 3)) {
    const ex = normalizeBilan(b);
    if (ex) exercices.push(ex);
  }

  if (exercices.length === 0) {
    return { financials: null, noPublicAccounts: false };
  }

  return {
    financials: {
      exercices,
      lastExercise: exercices[0] ?? null,
      noPublicAccounts: false,
      fetchedAt: new Date().toISOString(),
    },
    noPublicAccounts: false,
  };
}

function normalizeBilan(b: InpiBilanSaisi): FinancialExercise | null {
  const bilan = b.bilanSaisi?.bilan;
  if (!bilan) return null;
  const identite = bilan.identite ?? {};
  const closingDate = b.dateCloture ?? identite.dateClotureExercice ?? null;
  const year = closingDate ? parseInt(closingDate.slice(0, 4), 10) : NaN;
  if (!Number.isFinite(year)) return null;

  const liasses = (bilan.detail?.pages ?? []).flatMap((p) => p.liasses ?? []);
  // Index by code for fast lookup
  const byCode = new Map<string, { m1?: string; m2?: string; m3?: string; m4?: string }>();
  for (const l of liasses) {
    if (l.code) byCode.set(l.code, l);
  }

  const ca = pickField(byCode, FIELD_CODES.ca);
  const netResult = pickField(byCode, FIELD_CODES.netResult);
  const equity = pickField(byCode, FIELD_CODES.equity);
  const employees = pickField(byCode, FIELD_CODES.employees);

  return {
    year,
    closingDate,
    depositDate: b.dateDepot ?? null,
    ca,
    netResult,
    equity,
    ebitda: null,
    employees,
    durationMonths: identite.dureeExerciceN
      ? parseInt(identite.dureeExerciceN, 10) || null
      : null,
  };
}

/**
 * For each candidate code, scan m1..m4 columns and return the first non-zero
 * value found. Returns null if nothing usable.
 */
function pickField(
  byCode: Map<string, { m1?: string; m2?: string; m3?: string; m4?: string }>,
  codes: string[],
): number | null {
  for (const code of codes) {
    const entry = byCode.get(code);
    if (!entry) continue;
    for (const col of ["m1", "m2", "m3", "m4"] as const) {
      const v = entry[col];
      if (!v) continue;
      const n = parseFinancialValue(v);
      if (n !== null && n !== 0) return n;
    }
  }
  return null;
}

/**
 * INPI bilans store values as 15-digit zero-padded strings in cents
 * (the convention is "centimes d'euros" — pre-2002 holdover).
 *
 * Example: "000005946000000" → 5_946_000_000 centimes → 59 460 000 €.
 * We return the value in euros (divide by 100).
 */
function parseFinancialValue(raw: string): number | null {
  const s = raw.trim();
  if (!s) return null;
  // Some entries are negative with a leading '-'
  const negative = s.startsWith("-");
  const digits = negative ? s.slice(1) : s;
  if (!/^\d+$/.test(digits)) return null;
  const cents = parseInt(digits, 10);
  if (!Number.isFinite(cents)) return null;
  const euros = Math.round(cents / 100);
  return negative ? -euros : euros;
}
