import Image from "next/image";

import LoginForm from "@/components/LoginForm";

export const dynamic = "force-dynamic";

export default function LoginPage({
  searchParams,
}: {
  searchParams: { redirect?: string };
}) {
  const redirectTo = searchParams.redirect ?? "/search";
  return (
    <main className="min-h-screen flex items-center justify-center px-4 bg-gradient-to-br from-brand-50 via-white to-slate-50">
      <div className="w-full max-w-md card p-8 space-y-6">
        <div className="flex flex-col items-center text-center">
          <Image
            src="/pepere-logo.png"
            alt="Sourcing"
            width={1536}
            height={1024}
            className="w-full max-w-[260px] h-auto"
            priority
          />
          <p className="text-sm text-slate-500 mt-4">
            Outil interne — connexion requise
          </p>
        </div>
        <LoginForm redirectTo={redirectTo} />
      </div>
    </main>
  );
}
