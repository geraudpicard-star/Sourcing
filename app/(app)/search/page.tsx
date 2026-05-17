import SearchPanel from "@/components/SearchPanel";

export const dynamic = "force-dynamic";

export default function SearchPage() {
  return (
    <main className="flex-1 px-8 py-8 max-w-7xl w-full">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">
          Recherche d&apos;entreprises
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Source : INSEE Sirene. Résultats normalisés, sauvegardables et exportables.
        </p>
      </header>
      <SearchPanel />
    </main>
  );
}
