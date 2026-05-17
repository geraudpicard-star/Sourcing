import "server-only";

import { getInpiToken, InpiAuthError } from "@/lib/api/inpi-auth";
import type { Dirigeant } from "@/types/company";

const BASE_URL =
  process.env.INPI_BASE_URL ?? "https://registre-national-entreprises.inpi.fr/api";

/**
 * INPI role codes for legal representatives (composition.pouvoirs[].roleEntreprise).
 * Source: nomenclature INPI "FCT". Subset of the most common roles.
 */
export const INPI_ROLE_LABELS: Record<string, string> = {
  "10": "Associé",
  "21": "Indivisaire",
  "30": "Gérant",
  "40": "Associé gérant",
  "50": "Président",
  "51": "Président du conseil de surveillance",
  "52": "Vice-président du conseil de surveillance",
  "53": "Président du directoire",
  "54": "Membre du directoire",
  "55": "Directeur général unique",
  "56": "Directeur général",
  "57": "Directeur général délégué",
  "58": "Vice-président",
  "60": "Directeur général",
  "61": "Co-gérant",
  "62": "Membre",
  "63": "Président du conseil d'administration",
  "64": "Vice-président du conseil d'administration",
  "65": "Administrateur",
  "66": "Représentant permanent",
  "70": "Président du conseil d'administration",
  "71": "Commissaire aux comptes titulaire",
  "72": "Commissaire aux comptes suppléant",
  "73": "Président",
  "74": "Représentant en France",
  "75": "Liquidateur",
  "80": "Trésorier",
  "91": "Président associé",
};

export class InpiApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body?: string,
  ) {
    super(message);
    this.name = "InpiApiError";
  }
}

interface InpiAddress {
  pays?: string;
  codePostal?: string;
  commune?: string;
  typeVoie?: string;
  voie?: string;
  numVoie?: string;
  indiceRepetition?: string;
  complementLocalisation?: string;
  distributionSpeciale?: string;
}

interface InpiEntreprise {
  pays?: string;
  siren?: string;
  denomination?: string;
  formeJuridique?: string;
  autreIdentifiantEtranger?: string;
}

interface InpiIndividu {
  descriptionPersonne?: {
    nom?: string;
    nomUsage?: string;
    prenoms?: string[];
    dateDeNaissance?: string;
    lieuDeNaissance?: string;
    nationalite?: string;
    genre?: string;
  };
}

interface InpiPouvoir {
  roleEntreprise?: string;
  typeDePersonne?: "INDIVIDU" | "ENTREPRISE" | string;
  actif?: boolean;
  entreprise?: InpiEntreprise;
  adresseEntreprise?: InpiAddress;
  individu?: InpiIndividu;
  adresseDomicile?: InpiAddress;
}

interface InpiCompanyResponse {
  siren: string;
  updatedAt?: string;
  formality?: {
    content?: {
      personneMorale?: {
        composition?: { pouvoirs?: InpiPouvoir[] };
      };
      personnePhysique?: unknown;
    };
  };
}

export interface InpiCompanyResult {
  siren: string;
  dirigeants: Dirigeant[];
  updatedAt: string | null;
}

export async function fetchInpiCompany(siren: string): Promise<InpiCompanyResult> {
  const cleanSiren = siren.replace(/\D/g, "");
  if (cleanSiren.length !== 9) {
    throw new InpiApiError(`SIREN invalide : ${siren}`, 400);
  }

  const token = await getInpiToken();
  const res = await fetch(`${BASE_URL}/companies/${cleanSiren}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    cache: "no-store",
  });

  if (res.status === 404) {
    return { siren: cleanSiren, dirigeants: [], updatedAt: null };
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new InpiApiError(
      `INPI fetch failed for SIREN ${cleanSiren} (${res.status})`,
      res.status,
      body,
    );
  }

  const data = (await res.json()) as InpiCompanyResponse;
  const pouvoirs = data.formality?.content?.personneMorale?.composition?.pouvoirs ?? [];
  const dirigeants = pouvoirs.map(normalizePouvoir).filter((d): d is Dirigeant => d !== null);
  return { siren: cleanSiren, dirigeants, updatedAt: data.updatedAt ?? null };
}

function normalizePouvoir(p: InpiPouvoir): Dirigeant | null {
  if (p.actif === false) return null;
  const roleCode = p.roleEntreprise ?? null;
  const roleLabel = roleCode ? (INPI_ROLE_LABELS[roleCode] ?? `Rôle ${roleCode}`) : null;

  if (p.typeDePersonne === "INDIVIDU" && p.individu?.descriptionPersonne) {
    const desc = p.individu.descriptionPersonne;
    const prenom = (desc.prenoms ?? []).join(" ").trim() || null;
    const nom = desc.nomUsage ?? desc.nom ?? null;
    if (!prenom && !nom) return null;
    return {
      kind: "individu",
      roleCode,
      roleLabel,
      prenom,
      nom,
      nationalite: desc.nationalite ?? null,
      dateNaissance: desc.dateDeNaissance ?? null,
      lieuNaissance: desc.lieuDeNaissance ?? null,
      denomination: null,
      siren: null,
      formeJuridique: null,
    };
  }

  if (p.typeDePersonne === "ENTREPRISE" && p.entreprise) {
    const ent = p.entreprise;
    if (!ent.denomination && !ent.siren) return null;
    return {
      kind: "entreprise",
      roleCode,
      roleLabel,
      prenom: null,
      nom: null,
      nationalite: null,
      dateNaissance: null,
      lieuNaissance: null,
      denomination: ent.denomination ?? null,
      siren: ent.siren ?? ent.autreIdentifiantEtranger ?? null,
      formeJuridique: ent.formeJuridique ?? null,
    };
  }

  return null;
}

export { InpiAuthError };
