"use client";

import { useEffect, useState } from "react";

import type { Company, Dirigeant } from "@/types/company";

interface DirigeantsResponse {
  dirigeants: Dirigeant[];
  fetchedAt: string;
  fromCache: boolean;
}

interface Props {
  /** Company to show in the drawer; null closes it. */
  company: Company | null;
  onClose: () => void;
}

export default function CompanyDrawer({ company, onClose }: Props) {
  const siren = company?.siren ?? null;
  const [data, setData] = useState<DirigeantsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!siren) {
      setData(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    setData(null);
    fetch(`/api/companies/${siren}`)
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.detail ?? body.error ?? `Erreur ${res.status}`);
        }
        return res.json() as Promise<DirigeantsResponse>;
      })
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((e: unknown) => {
        if (!cancelled)
          setError(e instanceof Error ? e.message : "Erreur inconnue");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [siren]);

  useEffect(() => {
    if (!siren) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [siren, onClose]);

  if (!company) return null;

  return (
    <div className="fixed inset-0 z-40">
      <div
        className="absolute inset-0 bg-slate-900/30"
        onClick={onClose}
        aria-hidden
      />
      <aside className="absolute right-0 top-0 h-full w-full max-w-xl bg-white shadow-2xl flex flex-col">
        <header className="flex items-start justify-between gap-4 px-6 py-4 border-b">
          <div className="min-w-0">
            <div className="text-xs text-slate-500 font-mono">{company.siren}</div>
            <h2 className="text-lg font-semibold truncate">
              {company.denomination}
            </h2>
            <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-2 flex-wrap">
              {company.nafCode ? <span>NAF {company.nafCode}</span> : null}
              {company.employeeRange ? (
                <>
                  <span className="text-slate-300">·</span>
                  <span>{company.employeeRange}</span>
                </>
              ) : null}
              {company.creationDate ? (
                <>
                  <span className="text-slate-300">·</span>
                  <span>Créée {company.creationDate}</span>
                </>
              ) : null}
              <span className="text-slate-300">·</span>
              <span
                className={`inline-flex items-center gap-1 ${company.active ? "text-emerald-700" : "text-slate-400"}`}
              >
                <span
                  className={`inline-block w-1.5 h-1.5 rounded-full ${company.active ? "bg-emerald-500" : "bg-slate-300"}`}
                />
                {company.active ? "Active" : "Inactive"}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="btn-ghost px-2 py-1 text-lg"
            aria-label="Fermer"
          >
            ×
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
          {/* Address block */}
          <section>
            <SectionHeader title="Adresse du siège" />
            <AddressBlock company={company} />
          </section>

          {/* Dirigeants */}
          <section>
            <SectionHeader
              title="Dirigeants (RNE / INPI)"
              right={
                data?.fetchedAt ? (
                  <span className="text-xs text-slate-400">
                    {data.fromCache ? "cache · " : ""}
                    {formatRelative(data.fetchedAt)}
                  </span>
                ) : null
              }
            />
            {error ? (
              <div className="rounded-md bg-amber-50 border border-amber-200 text-amber-800 text-sm px-4 py-3">
                {error}
              </div>
            ) : loading ? (
              <div className="text-sm text-slate-500">Chargement…</div>
            ) : data ? (
              data.dirigeants.length === 0 ? (
                <div className="text-sm text-slate-500">
                  Aucun dirigeant déclaré au RNE pour cette entreprise.
                </div>
              ) : (
                <ul className="space-y-2">
                  {data.dirigeants.map((d, i) => (
                    <li key={i} className="card p-3">
                      <DirigeantRow dirigeant={d} />
                    </li>
                  ))}
                </ul>
              )
            ) : null}
          </section>
        </div>
      </aside>
    </div>
  );
}

function SectionHeader({
  title,
  right,
}: {
  title: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between mb-2">
      <h3 className="text-xs uppercase tracking-wider text-slate-500 font-semibold">
        {title}
      </h3>
      {right}
    </div>
  );
}

function AddressBlock({ company }: { company: Company }) {
  const lines = mailLines(company);
  const text = lines.join("\n");
  const [copied, setCopied] = useState(false);

  return (
    <div className="card p-4">
      <div className="font-mono text-sm whitespace-pre leading-6 text-slate-800">
        {text || <span className="text-slate-400">Adresse incomplète</span>}
      </div>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={async () => {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          disabled={!text}
          className="btn-secondary text-xs"
        >
          {copied ? "Copié ✓" : "Copier l'étiquette"}
        </button>
      </div>
    </div>
  );
}

function DirigeantRow({
  dirigeant,
  allowRecursion = true,
}: {
  dirigeant: Dirigeant;
  allowRecursion?: boolean;
}) {
  if (dirigeant.kind === "individu") {
    const fullname = [dirigeant.prenom, dirigeant.nom].filter(Boolean).join(" ");
    return (
      <div>
        <div className="font-medium">{fullname || "—"}</div>
        <div className="text-xs text-slate-500 mt-0.5">
          {dirigeant.roleLabel ?? "Rôle inconnu"}
          {dirigeant.dateNaissance ? ` · né(e) ${dirigeant.dateNaissance}` : ""}
          {dirigeant.nationalite ? ` · ${dirigeant.nationalite}` : ""}
        </div>
      </div>
    );
  }
  return <EntityDirigeantBlock dirigeant={dirigeant} allowRecursion={allowRecursion} />;
}

function EntityDirigeantBlock({
  dirigeant,
  allowRecursion,
}: {
  dirigeant: Dirigeant;
  allowRecursion: boolean;
}) {
  const frSiren =
    dirigeant.siren && /^\d{9}$/.test(dirigeant.siren) ? dirigeant.siren : null;
  const [nested, setNested] = useState<DirigeantsResponse | null>(null);
  const [nestedLoading, setNestedLoading] = useState(false);
  const [nestedError, setNestedError] = useState<string | null>(null);

  useEffect(() => {
    if (!allowRecursion || !frSiren) return;
    let cancelled = false;
    setNestedLoading(true);
    setNestedError(null);
    fetch(`/api/companies/${frSiren}`)
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.detail ?? body.error ?? `Erreur ${res.status}`);
        }
        return res.json() as Promise<DirigeantsResponse>;
      })
      .then((d) => {
        if (!cancelled) setNested(d);
      })
      .catch((e: unknown) => {
        if (!cancelled)
          setNestedError(e instanceof Error ? e.message : "Erreur inconnue");
      })
      .finally(() => {
        if (!cancelled) setNestedLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [allowRecursion, frSiren]);

  // Show only INDIVIDU children — those are the real humans behind the entity.
  const humans =
    nested?.dirigeants.filter((d) => d.kind === "individu") ?? [];

  return (
    <div>
      <div className="font-medium">
        {dirigeant.denomination ?? "Personne morale"}
      </div>
      <div className="text-xs text-slate-500 mt-0.5">
        {dirigeant.roleLabel ?? "Rôle inconnu"}
        {dirigeant.siren ? ` · SIREN ${dirigeant.siren}` : " · étranger"}
        {dirigeant.formeJuridique
          ? ` · forme jur. ${dirigeant.formeJuridique}`
          : ""}
      </div>

      {allowRecursion && frSiren ? (
        <div className="mt-3 pl-3 border-l-2 border-brand-200 space-y-2">
          {nestedLoading ? (
            <div className="text-xs text-slate-400">
              ↳ recherche des dirigeants de la holding…
            </div>
          ) : nestedError ? (
            <div className="text-xs text-amber-600">
              ↳ impossible de récupérer ({nestedError})
            </div>
          ) : humans.length === 0 ? (
            <div className="text-xs text-slate-400">
              ↳ aucun dirigeant individuel direct dans cette entité
            </div>
          ) : (
            humans.map((h, i) => (
              <div key={i} className="text-xs">
                <span className="text-brand-700">↳ </span>
                <span className="font-medium text-slate-800">
                  {[h.prenom, h.nom].filter(Boolean).join(" ")}
                </span>
                <span className="text-slate-500">
                  {h.roleLabel ? ` · ${h.roleLabel}` : ""}
                  {h.dateNaissance ? ` · né(e) ${h.dateNaissance}` : ""}
                </span>
              </div>
            ))
          )}
        </div>
      ) : !frSiren ? (
        <div className="mt-2 text-xs text-slate-400">
          ↳ entité étrangère — données non disponibles
        </div>
      ) : null}
    </div>
  );
}

/**
 * Build a postal-mail ready address block (French standard).
 */
function mailLines(c: Company): string[] {
  const out: string[] = [];
  if (c.denomination) out.push(c.denomination);
  if (c.address.complement) out.push(c.address.complement.toUpperCase());
  if (c.address.street) out.push(c.address.street.toUpperCase());
  const cp = c.address.postalCode ?? "";
  const city = (c.address.city ?? "").toUpperCase();
  if (cp || city) out.push(`${cp} ${city}`.trim());
  if (c.address.cedex) out.push(c.address.cedex.toUpperCase());
  return out;
}

function formatRelative(iso: string): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  const diffMs = Date.now() - t;
  const day = 24 * 60 * 60 * 1000;
  if (diffMs < day) return "aujourd'hui";
  const days = Math.floor(diffMs / day);
  if (days < 30) return `il y a ${days} j`;
  const months = Math.floor(days / 30);
  return `il y a ${months} mois`;
}
