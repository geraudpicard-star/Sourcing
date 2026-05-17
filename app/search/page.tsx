import SearchPanel from "@/components/SearchPanel";
import Sidebar from "@/components/Sidebar";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function SearchPage() {
  const user = await requireUser();
  return (
    <div className="flex min-h-screen">
      <Sidebar email={user.email ?? null} />
      <div className="flex-1 min-w-0 flex flex-col">
        <main className="flex-1 px-8 py-8 max-w-7xl w-full">
          <header className="mb-6">
            <h1 className="text-2xl font-semibold tracking-tight">
              Recherche d&apos;entreprises
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Source : INSEE Sirene. Résultats normalisés, sauvegardables et
              exportables.
            </p>
          </header>
          <SearchPanel />
        </main>
      </div>
    </div>
  );
}
