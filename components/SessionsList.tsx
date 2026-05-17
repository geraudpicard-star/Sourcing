"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import CompanyDrawer from "@/components/CompanyDrawer";
import {
  summarizeFilters,
  type Company,
  type SavedSessionDetail,
  type SavedSessionSummary,
} from "@/types/company";

interface Props {
  sessions: SavedSessionSummary[];
}

export default function SessionsList({ sessions }: Props) {
  const router = useRouter();
  const [openId, setOpenId] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, SavedSessionDetail>>({});
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [drawerCompany, setDrawerCompany] = useState<Company | null>(null);

  async function toggle(id: string) {
    if (openId === id) {
      setOpenId(null);
      return;
    }
    setOpenId(id);
    if (details[id]) return;
    setLoadingId(id);
    setError(null);
    try {
      const res = await fetch(`/api/companies/sessions/${id}`);
      if (!res.ok) throw new Error(`Erreur ${res.status}`);
      const data = (await res.json()) as SavedSessionDetail;
      setDetails((prev) => ({ ...prev, [id]: data }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setLoadingId(null);
    }
  }

  async function rename(id: string, current: string | null) {
    const next = window.prompt("Nom de la session :", current ?? "");
    if (next === null) return;
    setBusyId(id);
    try {
      const res = await fetch(`/api/companies/sessions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: next.trim() || null }),
      });
      if (!res.ok) throw new Error(`Erreur ${res.status}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setBusyId(null);
    }
  }

  async function remove(id: string) {
    if (!window.confirm("Supprimer cette session ? Les fiches restent en base.")) return;
    setBusyId(id);
    try {
      const res = await fetch(`/api/companies/sessions/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(`Erreur ${res.status}`);
      setDetails((prev) => {
        const { [id]: _, ...rest } = prev;
        return rest;
      });
      if (openId === id) setOpenId(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setBusyId(null);
    }
  }

  async function exportSession(id: string) {
    const res = await fetch("/api/companies/export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: id }),
    });
    if (!res.ok) {
      setError(`Erreur export ${res.status}`);
      return;
    }
    await downloadBlob(res, `sourcing-session-${id.slice(0, 8)}.csv`);
  }

  async function exportAll() {
    const res = await fetch("/api/companies/export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    if (!res.ok) {
      setError(`Erreur export ${res.status}`);
      return;
    }
    await downloadBlob(res, `sourcing-tout-${new Date().toISOString().slice(0, 10)}.csv`);
  }

  const totalCompanies = sessions.reduce((s, x) => s + x.count, 0);

  return (
    <div className="space-y-4">
      {/* Stats strip */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <StatCard label="Sessions" value={sessions.length.toLocaleString("fr-FR")} />
        <StatCard label="Entreprises" value={totalCompanies.toLocaleString("fr-FR")} />
        <div className="card p-4 flex items-center justify-between">
          <div>
            <div className="text-xs uppercase tracking-wider text-slate-500">Actions</div>
            <div className="text-sm text-slate-600 mt-1">Tout exporter</div>
          </div>
          <button type="button" onClick={exportAll} className="btn-secondary">
            CSV
          </button>
        </div>
      </div>

      {error ? (
        <div className="rounded-md bg-red-50 border border-red-200 text-red-800 text-sm px-4 py-2">
          {error}
        </div>
      ) : null}

      {sessions.length === 0 ? (
        <div className="card p-12 text-center text-slate-500 text-sm">
          Aucune session pour l&apos;instant. Lance une recherche, sélectionne
          des entreprises et clique <em>Sauvegarder</em>.
        </div>
      ) : null}

      {sessions.map((s) => {
        const open = openId === s.id;
        const detail = details[s.id];
        return (
          <div key={s.id} className="card overflow-hidden">
            <button
              type="button"
              onClick={() => toggle(s.id)}
              className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-50 text-left"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span
                  className={`inline-block transition-transform text-brand-700 ${open ? "rotate-90" : ""}`}
                >
                  ▶
                </span>
                <div className="min-w-0">
                  <div className="font-medium truncate">
                    {s.label ?? defaultLabel(s.createdAt)}
                  </div>
                  <div className="text-xs text-slate-500 truncate mt-0.5">
                    {summarizeFilters(s.filters)}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3 text-sm shrink-0">
                <span className="chip">
                  {s.count} entreprise{s.count > 1 ? "s" : ""}
                </span>
                <span className="text-slate-400 text-xs">{formatDate(s.createdAt)}</span>
              </div>
            </button>

            {open ? (
              <div className="border-t">
                <div className="px-5 py-2 flex items-center gap-2 text-xs bg-slate-50/60">
                  <button
                    type="button"
                    onClick={() => rename(s.id, s.label)}
                    disabled={busyId === s.id}
                    className="btn-ghost px-2 py-1"
                  >
                    Renommer
                  </button>
                  <button
                    type="button"
                    onClick={() => exportSession(s.id)}
                    className="btn-ghost px-2 py-1"
                  >
                    Export CSV
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(s.id)}
                    disabled={busyId === s.id}
                    className="ml-auto rounded px-2 py-1 text-red-700 hover:bg-red-50"
                  >
                    Supprimer
                  </button>
                </div>
                {loadingId === s.id ? (
                  <div className="px-5 py-6 text-sm text-slate-500">
                    Chargement…
                  </div>
                ) : detail ? (
                  <CompaniesTable
                    companies={detail.companies}
                    onRowClick={setDrawerCompany}
                  />
                ) : null}
              </div>
            ) : null}
          </div>
        );
      })}

      <CompanyDrawer
        company={drawerCompany}
        onClose={() => setDrawerCompany(null)}
      />
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="card p-4">
      <div className="text-xs uppercase tracking-wider text-slate-500">{label}</div>
      <div className="text-2xl font-semibold text-slate-900 mt-1 tabular-nums">{value}</div>
    </div>
  );
}

function CompaniesTable({
  companies,
  onRowClick,
}: {
  companies: Company[];
  onRowClick: (c: Company) => void;
}) {
  if (companies.length === 0) {
    return (
      <div className="px-5 py-6 text-sm text-slate-500">
        Aucune entreprise dans cette session.
      </div>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead className="bg-slate-50 text-slate-600">
          <tr>
            <th className="px-3 py-2 text-left">SIREN</th>
            <th className="px-3 py-2 text-left">Dénomination</th>
            <th className="px-3 py-2 text-left">NAF</th>
            <th className="px-3 py-2 text-left">Création</th>
            <th className="px-3 py-2 text-right">Âge</th>
            <th className="px-3 py-2 text-left">Effectif</th>
            <th className="px-3 py-2 text-left">Commune</th>
            <th className="px-3 py-2 text-left">Dép.</th>
            <th className="px-3 py-2 text-left">Actif</th>
          </tr>
        </thead>
        <tbody>
          {companies.map((c) => (
            <tr
              key={c.siren}
              className="border-t hover:bg-brand-50/40 cursor-pointer"
              onClick={() => onRowClick(c)}
            >
              <td className="px-3 py-2 font-mono text-xs text-slate-600">{c.siren}</td>
              <td className="px-3 py-2 font-medium">{c.denomination}</td>
              <td className="px-3 py-2 text-slate-600">{c.nafCode ?? ""}</td>
              <td className="px-3 py-2 text-slate-600">{c.creationDate ?? ""}</td>
              <td className="px-3 py-2 text-right text-slate-600">{c.ageYears ?? ""}</td>
              <td className="px-3 py-2 text-slate-600">{c.employeeRange ?? ""}</td>
              <td className="px-3 py-2 text-slate-600">{c.address.city ?? ""}</td>
              <td className="px-3 py-2 text-slate-600">{c.address.department ?? ""}</td>
              <td className="px-3 py-2">
                <span
                  className={`inline-block w-2 h-2 rounded-full mr-1 align-middle ${
                    c.active ? "bg-emerald-500" : "bg-slate-300"
                  }`}
                />
                <span className="align-middle text-slate-600">
                  {c.active ? "Oui" : "Non"}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function defaultLabel(iso: string): string {
  return `Recherche du ${formatDate(iso)}`;
}

async function downloadBlob(res: Response, filename: string) {
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
