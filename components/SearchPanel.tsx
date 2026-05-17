"use client";

import { useState } from "react";

import CompanyDrawer from "@/components/CompanyDrawer";
import Toast, { useToast } from "@/components/Toast";
import {
  EMPLOYEE_RANGES,
  summarizeFilters,
  type Company,
  type SearchResult,
} from "@/types/company";

interface FormState {
  nafCode: string;
  department: string;
  commune: string;
  minAgeYears: string;
  employeeRangeCodes: string[];
  activeOnly: boolean;
  pageSize: number;
}

const INITIAL: FormState = {
  nafCode: "",
  department: "",
  commune: "",
  minAgeYears: "",
  employeeRangeCodes: [],
  activeOnly: true,
  pageSize: 50,
};

export default function SearchPanel() {
  const [form, setForm] = useState<FormState>(INITIAL);
  const [appliedFilters, setAppliedFilters] = useState<FormState | null>(null);
  const [page, setPage] = useState(0);
  const [result, setResult] = useState<SearchResult | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [drawerCompany, setDrawerCompany] = useState<Company | null>(null);
  const toast = useToast();

  function currentFilters(state: FormState) {
    return {
      nafCode: state.nafCode || undefined,
      department: state.department || undefined,
      commune: state.commune || undefined,
      minAgeYears: state.minAgeYears ? Number(state.minAgeYears) : undefined,
      employeeRangeCodes:
        state.employeeRangeCodes.length > 0
          ? state.employeeRangeCodes
          : undefined,
      activeOnly: state.activeOnly,
    };
  }

  async function runSearch(targetPage = 0, source: FormState = form) {
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/companies/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...currentFilters(source),
          page: targetPage,
          pageSize: source.pageSize,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Erreur ${res.status}`);
      }
      const data = (await res.json()) as SearchResult;
      setResult(data);
      setPage(targetPage);
      setSelected(new Set());
      setAppliedFilters(source);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setPending(false);
    }
  }

  function toggleSelected(siren: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(siren)) next.delete(siren);
      else next.add(siren);
      return next;
    });
  }

  function toggleAll() {
    if (!result) return;
    if (selected.size === result.companies.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(result.companies.map((c) => c.siren)));
    }
  }

  async function saveSelected() {
    if (!result || !appliedFilters) return;
    const toSave = result.companies.filter((c) => selected.has(c.siren));
    if (toSave.length === 0) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/companies/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companies: toSave,
          filters: currentFilters(appliedFilters),
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Erreur ${res.status}`);
      }
      const { saved } = (await res.json()) as { saved: number };
      toast.show(
        `${saved} entreprise${saved > 1 ? "s" : ""} sauvegardée${saved > 1 ? "s" : ""} dans une nouvelle session`,
        "success",
      );
      setSelected(new Set());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setSaving(false);
    }
  }

  async function exportCsv() {
    if (!result) return;
    setExporting(true);
    setError(null);
    try {
      const toExport = selected.size > 0
        ? result.companies.filter((c) => selected.has(c.siren))
        : result.companies;
      const res = await fetch("/api/companies/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companies: toExport }),
      });
      if (!res.ok) throw new Error(`Erreur ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `sourcing-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setExporting(false);
    }
  }

  function removeFilter(key: keyof FormState) {
    if (!appliedFilters) return;
    const next: FormState = { ...appliedFilters };
    if (key === "employeeRangeCodes") next.employeeRangeCodes = [];
    else if (key === "activeOnly") next.activeOnly = false;
    else (next[key] as string) = "";
    setForm(next);
    runSearch(0, next);
  }

  const totalPages = result
    ? Math.max(1, Math.ceil(result.total / result.pageSize))
    : 0;

  return (
    <div className="space-y-6">
      <form
        className="card p-6 grid grid-cols-1 md:grid-cols-3 gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          runSearch(0);
        }}
      >
        <Field label="Code NAF" hint="ex : 62.01Z">
          <input
            type="text"
            value={form.nafCode}
            onChange={(e) => setForm({ ...form, nafCode: e.target.value })}
            className="input"
          />
        </Field>
        <Field label="Département" hint="ex : 75, 2A, 974">
          <input
            type="text"
            value={form.department}
            onChange={(e) => setForm({ ...form, department: e.target.value })}
            className="input"
          />
        </Field>
        <Field label="Commune">
          <input
            type="text"
            value={form.commune}
            onChange={(e) => setForm({ ...form, commune: e.target.value })}
            className="input"
          />
        </Field>
        <Field label="Ancienneté minimale" hint="en années">
          <input
            type="number"
            min={0}
            value={form.minAgeYears}
            onChange={(e) =>
              setForm({ ...form, minAgeYears: e.target.value })
            }
            className="input"
          />
        </Field>
        <Field label="Tranches d'effectif" hint="Cmd/Ctrl pour multi-sélection">
          <select
            multiple
            value={form.employeeRangeCodes}
            onChange={(e) =>
              setForm({
                ...form,
                employeeRangeCodes: Array.from(
                  e.target.selectedOptions,
                  (o) => o.value,
                ),
              })
            }
            className="input h-32"
          >
            {Object.entries(EMPLOYEE_RANGES).map(([code, label]) => (
              <option key={code} value={code}>
                {code} — {label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Résultats par page" hint="max 1000">
          <input
            type="number"
            min={1}
            max={1000}
            value={form.pageSize}
            onChange={(e) =>
              setForm({ ...form, pageSize: Number(e.target.value) || 50 })
            }
            className="input"
          />
        </Field>
        <div className="md:col-span-3 flex items-center justify-between pt-2 border-t">
          <label className="inline-flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.activeOnly}
              onChange={(e) =>
                setForm({ ...form, activeOnly: e.target.checked })
              }
              className="rounded border-slate-300 text-brand-900 focus:ring-brand-500"
            />
            Sociétés actives uniquement
          </label>
          <button type="submit" disabled={pending} className="btn-primary px-5">
            {pending ? "Recherche…" : "Rechercher"}
          </button>
        </div>
      </form>

      {error ? (
        <div className="rounded-md bg-red-50 border border-red-200 text-red-800 text-sm px-4 py-3">
          {error}
        </div>
      ) : null}

      {result ? (
        <div className="card">
          {/* Stats strip */}
          <div className="px-4 py-3 border-b flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3 text-sm">
              <span className="font-medium text-slate-900">
                {result.total.toLocaleString("fr-FR")} résultat
                {result.total > 1 ? "s" : ""}
              </span>
              {result.fromCache ? (
                <span className="text-[10px] uppercase tracking-wider text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded">
                  cache
                </span>
              ) : null}
              <span className="text-slate-400">·</span>
              <span className="text-slate-500">
                {selected.size > 0
                  ? `${selected.size} sélectionnée${selected.size > 1 ? "s" : ""}`
                  : `page ${page + 1} sur ${totalPages}`}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={saveSelected}
                disabled={saving || selected.size === 0}
                className="btn-primary disabled:cursor-not-allowed"
              >
                {saving
                  ? "Sauvegarde…"
                  : `Sauvegarder (${selected.size})`}
              </button>
              <button
                type="button"
                onClick={exportCsv}
                disabled={exporting || result.companies.length === 0}
                className="btn-secondary"
              >
                {exporting ? "Export…" : "Export CSV"}
              </button>
            </div>
          </div>

          {/* Filter chips */}
          {appliedFilters ? (
            <FilterChips
              filters={appliedFilters}
              onRemove={removeFilter}
              summary={summarizeFilters(currentFilters(appliedFilters))}
            />
          ) : null}

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-slate-600 sticky top-0 z-10">
                <tr>
                  <th className="px-3 py-2 text-left w-8">
                    <input
                      type="checkbox"
                      checked={
                        result.companies.length > 0 &&
                        selected.size === result.companies.length
                      }
                      onChange={toggleAll}
                      className="rounded border-slate-300 text-brand-900 focus:ring-brand-500"
                    />
                  </th>
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
                {result.companies.map((c) => (
                  <tr
                    key={c.siren}
                    className={`border-t cursor-pointer ${
                      selected.has(c.siren) ? "bg-brand-50" : "hover:bg-slate-50"
                    }`}
                    onClick={() => setDrawerCompany(c)}
                  >
                    <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selected.has(c.siren)}
                        onChange={() => toggleSelected(c.siren)}
                        className="rounded border-slate-300 text-brand-900 focus:ring-brand-500"
                      />
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-slate-600">
                      {c.siren}
                    </td>
                    <td className="px-3 py-2 font-medium">{c.denomination}</td>
                    <td className="px-3 py-2 text-slate-600">{c.nafCode ?? ""}</td>
                    <td className="px-3 py-2 text-slate-600">{c.creationDate ?? ""}</td>
                    <td className="px-3 py-2 text-right text-slate-600">
                      {c.ageYears ?? ""}
                    </td>
                    <td className="px-3 py-2 text-slate-600">
                      {c.employeeRange ?? ""}
                    </td>
                    <td className="px-3 py-2 text-slate-600">
                      {c.address.city ?? ""}
                    </td>
                    <td className="px-3 py-2 text-slate-600">
                      {c.address.department ?? ""}
                    </td>
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
                {result.companies.length === 0 ? (
                  <tr>
                    <td
                      colSpan={10}
                      className="px-3 py-12 text-center text-slate-500"
                    >
                      Aucun résultat pour ces critères.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between px-4 py-3 border-t text-sm">
            <div className="text-slate-500">
              Page {page + 1} / {totalPages}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={pending || page === 0}
                onClick={() => runSearch(page - 1, appliedFilters ?? form)}
                className="btn-secondary px-3 py-1"
              >
                Précédent
              </button>
              <button
                type="button"
                disabled={pending || page + 1 >= totalPages}
                onClick={() => runSearch(page + 1, appliedFilters ?? form)}
                className="btn-secondary px-3 py-1"
              >
                Suivant
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <Toast state={toast.state} />
      <CompanyDrawer company={drawerCompany} onClose={() => setDrawerCompany(null)} />
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block text-sm">
      <span className="flex items-baseline justify-between mb-1">
        <span className="font-medium text-slate-700">{label}</span>
        {hint ? <span className="text-xs text-slate-400">{hint}</span> : null}
      </span>
      {children}
    </label>
  );
}

function FilterChips({
  filters,
  onRemove,
  summary,
}: {
  filters: FormState;
  onRemove: (key: keyof FormState) => void;
  summary: string;
}) {
  const chips: { key: keyof FormState; label: string }[] = [];
  if (filters.nafCode) chips.push({ key: "nafCode", label: `NAF ${filters.nafCode}` });
  if (filters.department) chips.push({ key: "department", label: `Dép. ${filters.department}` });
  if (filters.commune) chips.push({ key: "commune", label: filters.commune });
  if (filters.minAgeYears) chips.push({ key: "minAgeYears", label: `≥ ${filters.minAgeYears} ans` });
  if (filters.employeeRangeCodes.length > 0)
    chips.push({
      key: "employeeRangeCodes",
      label: `Effectif (${filters.employeeRangeCodes.length})`,
    });
  if (filters.activeOnly) chips.push({ key: "activeOnly", label: "Actives" });

  if (chips.length === 0) return null;

  return (
    <div className="px-4 py-2 border-b flex items-center gap-2 flex-wrap text-xs">
      <span className="text-slate-500 mr-1">Filtres :</span>
      {chips.map((c) => (
        <button
          key={c.key}
          type="button"
          onClick={() => onRemove(c.key)}
          className="chip hover:bg-brand-100 transition"
          title={`Retirer · ${summary}`}
        >
          {c.label}
          <span className="text-brand-700">×</span>
        </button>
      ))}
    </div>
  );
}
