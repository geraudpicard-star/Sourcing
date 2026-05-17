import NAF from "@/lib/data/naf.json";

export interface NafEntry {
  code: string;
  label: string;
}

export interface NafMatch extends NafEntry {
  score: number;
}

const NAF_LIST = NAF as NafEntry[];

/** Pre-computed normalized labels for performance — built lazily once per process. */
let _index:
  | { entry: NafEntry; tokens: Set<string>; normLabel: string }[]
  | null = null;

function buildIndex() {
  if (_index) return _index;
  _index = NAF_LIST.map((entry) => ({
    entry,
    normLabel: normalize(entry.label),
    tokens: new Set(tokenize(entry.label)),
  }));
  return _index;
}

/**
 * Fuzzy search across NAF labels. Returns up to `limit` matches ranked by score.
 *
 * Scoring (heuristic):
 *  - +5 per query token that appears as a full word in the label
 *  - +2 per query token that appears as a substring of the label
 *  - +3 bonus if the entire query is a substring of the label
 *  - +1 bonus if the label starts with the first query token
 *
 * A query like "plomberie chauffage" matches:
 *   43.22A "Travaux d'installation d'eau et de gaz en tous locaux"  → mid score
 *   43.22B "Travaux d'installation d'équipements thermiques et de climatisation" → mid score
 *   (and chauffage-related codes)
 */
export function searchNaf(query: string, limit = 8): NafMatch[] {
  const q = query.trim();
  if (q.length < 2) return [];

  // If user types an exact NAF code, prioritize it.
  const codeMatch = NAF_LIST.find(
    (e) => e.code.toLowerCase() === q.toLowerCase(),
  );
  if (codeMatch) {
    return [{ ...codeMatch, score: 100 }];
  }

  const qTokens = tokenize(q).filter((t) => t.length >= 2);
  if (qTokens.length === 0) return [];
  const normQuery = normalize(q);

  const idx = buildIndex();
  const results: NafMatch[] = [];

  for (const { entry, tokens, normLabel } of idx) {
    let score = 0;
    for (const qt of qTokens) {
      if (tokens.has(qt)) score += 5;
      else if (normLabel.includes(qt)) score += 2;
    }
    if (score === 0) continue;
    if (normLabel.includes(normQuery)) score += 3;
    if (normLabel.startsWith(qTokens[0]!)) score += 1;

    results.push({ ...entry, score });
  }

  results.sort((a, b) => b.score - a.score || a.code.localeCompare(b.code));
  return results.slice(0, limit);
}

/** Return labels for a list of NAF codes (for UI display). */
export function labelFor(code: string): string | null {
  const e = NAF_LIST.find((x) => x.code === code);
  return e?.label ?? null;
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[''`]/g, " ")
    .replace(/[^a-z0-9 ]/g, " ");
}

function tokenize(s: string): string[] {
  return normalize(s)
    .split(/\s+/)
    .filter(Boolean);
}
