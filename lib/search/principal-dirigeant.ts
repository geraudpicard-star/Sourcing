import type { Dirigeant, PrincipalDirigeant } from "@/types/company";

/**
 * Priority order for the "addressable" dirigeant of a company.
 * Higher rank = higher priority. Lower numbers in INPI codes mean specific roles.
 *
 * Source: nomenclature INPI "FCT".
 */
const ROLE_PRIORITY: Record<string, number> = {
  "73": 100, // Président (SAS)
  "50": 95, // Président
  "70": 92, // Président du conseil d'administration
  "63": 90, // Président du conseil d'administration (variante)
  "53": 88, // Président du directoire
  "30": 85, // Gérant
  "40": 80, // Associé gérant
  "61": 78, // Co-gérant
  "55": 70, // Directeur général unique
  "60": 65, // Directeur général
  "56": 65, // Directeur général
  "57": 50, // Directeur général délégué
  "54": 40, // Membre du directoire
  "51": 35, // Président du conseil de surveillance
  "58": 30, // Vice-président
  "65": 20, // Administrateur
  "10": 5, // Associé
  "71": 0, // CAC titulaire — pas un dirigeant courrier
  "72": 0, // CAC suppléant
};

/**
 * Pick the most "addressable" individual dirigeant from a list, applying
 * priority order. If only entity dirigeants exist, returns null and the caller
 * should fall through to the holding lookup (see `pickPrincipalWithFallback`).
 */
function bestIndividu(dirigeants: Dirigeant[]): Dirigeant | null {
  const individus = dirigeants.filter((d) => d.kind === "individu");
  if (individus.length === 0) return null;
  individus.sort((a, b) => priorityOf(b) - priorityOf(a));
  return individus[0] ?? null;
}

function bestEntreprise(dirigeants: Dirigeant[]): Dirigeant | null {
  const entites = dirigeants.filter((d) => d.kind === "entreprise");
  if (entites.length === 0) return null;
  entites.sort((a, b) => priorityOf(b) - priorityOf(a));
  return entites[0] ?? null;
}

function priorityOf(d: Dirigeant): number {
  return d.roleCode ? (ROLE_PRIORITY[d.roleCode] ?? 10) : 0;
}

/**
 * Resolve the principal dirigeant for a company.
 * - First try: top INDIVIDU in the company's own dirigeants
 * - Fallback: if no individu, fetch the top ENTREPRISE's dirigeants (provided
 *   via the `lookupHolding` callback) and pick the top individu from there.
 *
 * Returns null if no human could be resolved (deep stack of holdings).
 */
export async function resolvePrincipalDirigeant(
  dirigeants: Dirigeant[],
  lookupHolding: (siren: string) => Promise<Dirigeant[]>,
): Promise<PrincipalDirigeant | null> {
  const direct = bestIndividu(dirigeants);
  if (direct) {
    return individuToPrincipal(direct, "self", null, null);
  }

  const topEntity = bestEntreprise(dirigeants);
  if (!topEntity || !topEntity.siren || !/^\d{9}$/.test(topEntity.siren)) {
    return null;
  }

  const holdingDirigeants = await lookupHolding(topEntity.siren);
  const nested = bestIndividu(holdingDirigeants);
  if (!nested) return null;
  return individuToPrincipal(
    nested,
    "holding",
    topEntity.siren,
    topEntity.denomination,
  );
}

function individuToPrincipal(
  d: Dirigeant,
  source: "self" | "holding",
  holdingSiren: string | null,
  holdingDenomination: string | null,
): PrincipalDirigeant {
  return {
    source,
    holdingSiren,
    holdingDenomination,
    prenom: d.prenom,
    nom: d.nom,
    roleCode: d.roleCode,
    roleLabel: d.roleLabel,
    dateNaissance: d.dateNaissance,
    ageYears: ageFromDateString(d.dateNaissance),
  };
}

export function ageFromDateString(date: string | null): number | null {
  if (!date) return null;
  // Accept YYYY, YYYY-MM, or YYYY-MM-DD
  const m = /^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?$/.exec(date);
  if (!m) return null;
  const y = parseInt(m[1]!, 10);
  const mo = m[2] ? parseInt(m[2], 10) - 1 : 6;
  const day = m[3] ? parseInt(m[3], 10) : 15;
  if (!Number.isFinite(y)) return null;
  const birth = Date.UTC(y, mo, day);
  const now = Date.now();
  const years = (now - birth) / (1000 * 60 * 60 * 24 * 365.2425);
  return Math.floor(years);
}
