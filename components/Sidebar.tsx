"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
}

const ITEMS: NavItem[] = [
  {
    href: "/search",
    label: "Recherche",
    icon: <SearchIcon />,
  },
  {
    href: "/saved",
    label: "Sauvegardés",
    icon: <BookmarkIcon />,
  },
];

export default function Sidebar({ email }: { email: string | null }) {
  const pathname = usePathname();
  const router = useRouter();

  async function signOut() {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <aside className="w-64 shrink-0 bg-white border-r border-slate-200 flex flex-col min-h-screen">
      <Link
        href="/search"
        className="flex items-center justify-center px-4 py-6 border-b border-slate-100"
      >
        <Image
          src="/pepere-logo.png"
          alt="Sourcing"
          width={1536}
          height={1024}
          className="w-full max-w-[200px] h-auto"
          priority
        />
      </Link>

      <nav className="flex-1 px-3 py-4 space-y-1">
        {ITEMS.map((item) => {
          const active =
            pathname === item.href || pathname?.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition ${
                active
                  ? "bg-brand-50 text-brand-700 font-medium"
                  : "text-slate-700 hover:bg-slate-50"
              }`}
            >
              <span
                className={`w-4 h-4 ${active ? "text-brand-600" : "text-slate-400"}`}
              >
                {item.icon}
              </span>
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="px-3 py-4 border-t border-slate-100 text-xs">
        <div className="px-2 py-1 text-slate-500 truncate" title={email ?? ""}>
          {email ?? "—"}
        </div>
        <button
          type="button"
          onClick={signOut}
          className="w-full mt-1 text-left px-2 py-1 rounded-md text-slate-600 hover:bg-slate-100"
        >
          Se déconnecter
        </button>
      </div>
    </aside>
  );
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="w-4 h-4">
      <circle cx="9" cy="9" r="6" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M14 14L17 17"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function BookmarkIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="w-4 h-4">
      <path
        d="M5 3.5A1.5 1.5 0 016.5 2h7A1.5 1.5 0 0115 3.5V17l-5-3-5 3V3.5z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}
