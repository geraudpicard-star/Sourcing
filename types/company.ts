import { z } from "zod";

/**
 * Normalized company representation used throughout the app.
 * SIREN is the stable identifier (legal unit). SIRET is the establishment.
 */
export interface Company {
  siren: string;
  siret: string | null;
  denomination: string;
  legalForm: string | null;
  nafCode: string | null;
  nafLabel: string | null;
  creationDate: string | null; // ISO date
  ageYears: number | null;
  employeeRange: string | null; // INSEE "trancheEffectifs" decoded label
  employeeRangeCode: string | null; // raw INSEE code (e.g. "11", "21")
  active: boolean;
  address: {
    street: string | null;
    complement: string | null;
    cedex: string | null;
    postalCode: string | null;
    city: string | null;
    department: string | null; // 2 or 3-char code
  };
  source: "insee";
  fetchedAt: string; // ISO timestamp
}

export interface Dirigeant {
  kind: "individu" | "entreprise";
  roleCode: string | null;
  roleLabel: string | null;
  // individu fields
  prenom: string | null;
  nom: string | null;
  nationalite: string | null;
  dateNaissance: string | null; // ISO or YYYY-MM
  lieuNaissance: string | null;
  // entreprise fields
  denomination: string | null;
  siren: string | null;
  formeJuridique: string | null;
}

export interface CompanyDetail {
  company: Company;
  dirigeants: Dirigeant[];
  dirigeantsFetchedAt: string | null;
}

export interface FinancialExercise {
  year: number;
  /** Date de clôture de l'exercice (YYYY-MM-DD) */
  closingDate: string | null;
  /** Date de dépôt au greffe */
  depositDate: string | null;
  /** Chiffre d'affaires (€) */
  ca: number | null;
  /** Résultat net (€) */
  netResult: number | null;
  /** Capitaux propres (€) */
  equity: number | null;
  /** EBITDA estimé (€) si dérivable du compte de résultat */
  ebitda: number | null;
  /** Effectif moyen déclaré sur l'exercice */
  employees: number | null;
  /** Durée de l'exercice en mois (généralement 12) */
  durationMonths: number | null;
}

export interface Financials {
  exercices: FinancialExercise[];
  /** Raccourci vers le dernier exercice publié (pour tri/filtre rapide) */
  lastExercise: FinancialExercise | null;
  /** True si la société a opté pour la confidentialité des comptes */
  noPublicAccounts: boolean;
  fetchedAt: string;
}

/** Dirigeant principal "addressable" pour un courrier (Président, Gérant, etc.). */
export interface PrincipalDirigeant {
  /** Référence à l'entité qui détient le rôle (peut être 'soi-même' ou une holding) */
  source: "self" | "holding";
  holdingSiren: string | null;
  holdingDenomination: string | null;
  prenom: string | null;
  nom: string | null;
  roleCode: string | null;
  roleLabel: string | null;
  dateNaissance: string | null;
  /** Âge estimé en années calculé au moment de la résolution */
  ageYears: number | null;
}

export const SearchFiltersSchema = z.object({
  nafCode: z
    .string()
    .trim()
    .regex(/^\d{2}\.\d{2}[A-Z]?$|^\d{4}[A-Z]?$/, "Code NAF invalide")
    .optional()
    .or(z.literal("").transform(() => undefined)),
  department: z
    .string()
    .trim()
    .regex(/^(\d{2}|\d{3}|2A|2B)$/, "Département invalide")
    .optional()
    .or(z.literal("").transform(() => undefined)),
  commune: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .optional()
    .or(z.literal("").transform(() => undefined)),
  minAgeYears: z.coerce.number().int().min(0).max(200).optional(),
  employeeRangeCodes: z.array(z.string()).optional(),
  activeOnly: z.coerce.boolean().default(true),
  page: z.coerce.number().int().min(0).default(0),
  pageSize: z.coerce.number().int().min(1).max(1000).default(50),
});

export type SearchFilters = z.infer<typeof SearchFiltersSchema>;

export interface SearchResult {
  companies: Company[];
  total: number;
  page: number;
  pageSize: number;
  fromCache: boolean;
}

export interface SavedSessionSummary {
  id: string;
  label: string | null;
  filters: Partial<SearchFilters>;
  createdAt: string;
  count: number;
}

export interface SavedSessionDetail extends SavedSessionSummary {
  companies: Company[];
}

/**
 * Build a short, human-readable label from the filters used in a search.
 * Used as the auto-name for saved sessions.
 */
export function summarizeFilters(filters: Partial<SearchFilters>): string {
  const bits: string[] = [];
  if (filters.nafCode) bits.push(`NAF ${filters.nafCode}`);
  if (filters.department) bits.push(`Dép. ${filters.department}`);
  if (filters.commune) bits.push(filters.commune);
  if (filters.minAgeYears) bits.push(`≥ ${filters.minAgeYears} ans`);
  if (filters.employeeRangeCodes?.length) {
    const labels = filters.employeeRangeCodes
      .map((c) => EMPLOYEE_RANGES[c] ?? c)
      .join(", ");
    bits.push(`Effectif : ${labels}`);
  }
  if (filters.activeOnly === false) bits.push("inclut inactives");
  return bits.length > 0 ? bits.join(" · ") : "Tous critères";
}

/**
 * INSEE "Tranche d'effectifs" — decoded labels.
 * Reference: https://www.insee.fr/fr/information/2406147
 */
export const EMPLOYEE_RANGES: Record<string, string> = {
  NN: "Non renseigné",
  "00": "0 salarié",
  "01": "1 ou 2 salariés",
  "02": "3 à 5 salariés",
  "03": "6 à 9 salariés",
  "11": "10 à 19 salariés",
  "12": "20 à 49 salariés",
  "21": "50 à 99 salariés",
  "22": "100 à 199 salariés",
  "31": "200 à 249 salariés",
  "32": "250 à 499 salariés",
  "41": "500 à 999 salariés",
  "42": "1 000 à 1 999 salariés",
  "51": "2 000 à 4 999 salariés",
  "52": "5 000 à 9 999 salariés",
  "53": "10 000 salariés et plus",
};
