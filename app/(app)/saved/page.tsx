import SessionsList from "@/components/SessionsList";
import { listSessions } from "@/lib/db/companies";

export const dynamic = "force-dynamic";

export default async function SavedPage() {
  const sessions = await listSessions();

  return (
    <main className="flex-1 px-8 py-8 max-w-7xl w-full">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">
          Sessions sauvegardées
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Chaque session regroupe les entreprises retenues d&apos;une recherche.
          Clique sur une session pour voir le détail.
        </p>
      </header>
      <SessionsList sessions={sessions} />
    </main>
  );
}
