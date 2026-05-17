import "server-only";

import { getInseeAuthHeader } from "@/lib/api/insee-auth";
import {
  EMPLOYEE_RANGES,
  type Company,
  type SearchFilters,
} from "@/types/company";

const BASE_URL =
  process.env.INSEE_BASE_URL ?? "https://api.insee.fr/api-sirene/3.11";

// INSEE Sirene caps page size at 1000. We expose a lower default upstream.
const MAX_PAGE_SIZE = 1000;

export class InseeApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body?: string,
  ) {
    super(message);
    this.name = "InseeApiError";
  }
}

interface InseeRawAddress {
  numeroVoieEtablissement?: string | null;
  indiceRepetitionEtablissement?: string | null;
  typeVoieEtablissement?: string | null;
  libelleVoieEtablissement?: string | null;
  complementAdresseEtablissement?: string | null;
  codePostalEtablissement?: string | null;
  libelleCommuneEtablissement?: string | null;
  codeCommuneEtablissement?: string | null;
  distributionSpecialeEtablissement?: string | null;
  libelleCedexEtablissement?: string | null;
  codeCedexEtablissement?: string | null;
}

interface InseePeriodeEtablissement {
  etatAdministratifEtablissement?: string | null;
  activitePrincipaleEtablissement?: string | null;
  nomenclatureActivitePrincipaleEtablissement?: string | null;
  dateDebut?: string | null;
  dateFin?: string | null;
}

interface InseeUniteLegale {
  denominationUniteLegale?: string | null;
  denominationUsuelle1UniteLegale?: string | null;
  nomUniteLegale?: string | null;
  prenom1UniteLegale?: string | null;
  categorieJuridiqueUniteLegale?: string | null;
  etatAdministratifUniteLegale?: string | null;
  activitePrincipaleUniteLegale?: string | null;
  nomenclatureActivitePrincipaleUniteLegale?: string | null;
  dateCreationUniteLegale?: string | null;
  trancheEffectifsUniteLegale?: string | null;
}

interface InseeEtablissement {
  siren: string;
  siret: string;
  uniteLegale: InseeUniteLegale;
  adresseEtablissement: InseeRawAddress;
  periodesEtablissement?: InseePeriodeEtablissement[];
  dateCreationEtablissement?: string | null;
}

interface InseeSiretResponse {
  header: {
    statut: number;
    message: string;
    total: number;
    debut: number;
    nombre: number;
    curseur?: string;
    curseurSuivant?: string;
  };
  etablissements: InseeEtablissement[];
}

/**
 * Build an INSEE Sirene `q=` query from our filter shape.
 * INSEE uses Lucene-ish syntax with field:value AND/OR groupings.
 */
function buildQuery(filters: SearchFilters): string {
  const parts: string[] = [];

  if (filters.nafCode) {
    // INSEE expects format like "62.01Z" or "6201Z"; we accept both and pass through.
    const naf = filters.nafCode.toUpperCase();
    parts.push(`activitePrincipaleUniteLegale:${naf}`);
  }

  if (filters.department) {
    // 2 or 3 digit department code matches start of postal code (works for metro + DOM).
    parts.push(`codePostalEtablissement:${filters.department}*`);
  }

  if (filters.commune) {
    // libelleCommuneEtablissement is uppercase, accent-folded.
    const c = filters.commune
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toUpperCase()
      .replace(/"/g, "");
    parts.push(`libelleCommuneEtablissement:"${c}"`);
  }

  if (filters.minAgeYears !== undefined && filters.minAgeYears > 0) {
    const cutoff = new Date();
    cutoff.setUTCFullYear(cutoff.getUTCFullYear() - filters.minAgeYears);
    const iso = cutoff.toISOString().slice(0, 10);
    parts.push(`dateCreationUniteLegale:[* TO ${iso}]`);
  }

  if (filters.employeeRangeCodes && filters.employeeRangeCodes.length > 0) {
    const inner = filters.employeeRangeCodes
      .map((c) => `trancheEffectifsUniteLegale:${c}`)
      .join(" OR ");
    parts.push(`(${inner})`);
  }

  if (filters.activeOnly) {
    // etatAdministratifEtablissement is a "periodic" field (historicized) in Sirene 3.11
    // and must be wrapped in `periode(...)` — otherwise INSEE returns 400.
    parts.push("periode(etatAdministratifEtablissement:A)");
    parts.push("etatAdministratifUniteLegale:A");
  }

  // Only "siège" establishments to avoid duplicate rows per company.
  parts.push("etablissementSiege:true");

  return parts.join(" AND ");
}

export interface InseeSearchOptions {
  filters: SearchFilters;
  signal?: AbortSignal;
}

export async function searchInsee({
  filters,
  signal,
}: InseeSearchOptions): Promise<{ companies: Company[]; total: number }> {
  const auth = await getInseeAuthHeader();

  const q = buildQuery(filters);
  const pageSize = Math.min(filters.pageSize, MAX_PAGE_SIZE);
  const debut = filters.page * pageSize;

  const url = new URL(`${BASE_URL}/siret`);
  url.searchParams.set("q", q);
  url.searchParams.set("nombre", String(pageSize));
  url.searchParams.set("debut", String(debut));

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: {
      Accept: "application/json",
      [auth.name]: auth.value,
    },
    signal,
    cache: "no-store",
  });

  if (res.status === 404) {
    // INSEE returns 404 when zero matches — that's not an error.
    return { companies: [], total: 0 };
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new InseeApiError(
      `INSEE Sirene request failed (${res.status})`,
      res.status,
      body,
    );
  }

  const data = (await res.json()) as InseeSiretResponse;
  const companies = data.etablissements.map(normalizeEtablissement);
  return { companies, total: data.header.total };
}

function normalizeEtablissement(e: InseeEtablissement): Company {
  const ul = e.uniteLegale;
  const addr = e.adresseEtablissement ?? {};
  const currentPeriod = e.periodesEtablissement?.[0];

  const denomination =
    ul.denominationUniteLegale ??
    ul.denominationUsuelle1UniteLegale ??
    [ul.prenom1UniteLegale, ul.nomUniteLegale].filter(Boolean).join(" ") ??
    "";

  const creationDate = ul.dateCreationUniteLegale ?? null;
  const ageYears = creationDate ? yearsSince(creationDate) : null;

  const employeeCode = ul.trancheEffectifsUniteLegale ?? null;
  const employeeRange = employeeCode
    ? (EMPLOYEE_RANGES[employeeCode] ?? null)
    : null;

  const active =
    (currentPeriod?.etatAdministratifEtablissement ?? "A") === "A" &&
    (ul.etatAdministratifUniteLegale ?? "A") === "A";

  const street = formatStreet(addr);
  const postalCode = addr.codePostalEtablissement ?? null;
  const department = postalCode ? departmentFromPostal(postalCode) : null;
  const cedex = formatCedex(addr);
  const complement =
    addr.complementAdresseEtablissement?.trim() || null;

  return {
    siren: e.siren,
    siret: e.siret ?? null,
    denomination: denomination.trim() || "(sans dénomination)",
    legalForm: ul.categorieJuridiqueUniteLegale ?? null,
    nafCode: ul.activitePrincipaleUniteLegale ?? null,
    nafLabel: null,
    creationDate,
    ageYears,
    employeeRange,
    employeeRangeCode: employeeCode,
    active,
    address: {
      street,
      complement,
      cedex,
      postalCode,
      city: addr.libelleCommuneEtablissement ?? null,
      department,
    },
    source: "insee",
    fetchedAt: new Date().toISOString(),
  };
}

function formatCedex(addr: InseeRawAddress): string | null {
  const code = addr.codeCedexEtablissement?.trim();
  const lib = addr.libelleCedexEtablissement?.trim();
  const distrib = addr.distributionSpecialeEtablissement?.trim();
  const cedexBits = [code, lib].filter(Boolean).join(" ");
  return [distrib, cedexBits].filter(Boolean).join(" — ") || null;
}

function formatStreet(addr: InseeRawAddress): string | null {
  const parts = [
    addr.numeroVoieEtablissement,
    addr.indiceRepetitionEtablissement,
    addr.typeVoieEtablissement,
    addr.libelleVoieEtablissement,
  ]
    .filter(Boolean)
    .join(" ")
    .trim();
  return parts || null;
}

function departmentFromPostal(postal: string): string | null {
  if (postal.length < 2) return null;
  const prefix = postal.slice(0, 2);
  // Corsica: 20xxx → 2A (20000-20199) or 2B (20200-20999) by convention.
  if (prefix === "20") {
    const num = parseInt(postal.slice(0, 3), 10);
    if (Number.isFinite(num)) return num < 202 ? "2A" : "2B";
    return prefix;
  }
  // DOM: 97xxx, 98xxx → 3-digit
  if (prefix === "97" || prefix === "98") return postal.slice(0, 3);
  return prefix;
}

function yearsSince(isoDate: string): number | null {
  const d = new Date(isoDate);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let years = now.getUTCFullYear() - d.getUTCFullYear();
  const m = now.getUTCMonth() - d.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < d.getUTCDate())) years--;
  return years;
}
