import SessionsList from "@/components/SessionsList";
import Sidebar from "@/components/Sidebar";
import { requireUser } from "@/lib/auth";
import { listSessions } from "@/lib/db/companies";

export const dynamic = "force-dynamic";

export default async function SavedPage() {
  const user = await requireUser();
  const sessions = await listSessions();

  return (
    <div className="flex min-h-screen">
      <Sidebar email={user.email ?? null} />
      <div className="flex-1 min-w-0 flex flex-col">
        <main className="flex-1 px-8 py-8 max-w-7xl w-full">
          <header className="mb-6">
            <h1 className="text-2xl font-semibold tracking-tight">
              Sessions sauvegardées
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Chaque session regroupe les entreprises retenues d&apos;une
              recherche. Clique sur une session pour voir le détail.
            </p>
          </header>
          <SessionsList sessions={sessions} />
        </main>
      </div>
    </div>
  );
}
