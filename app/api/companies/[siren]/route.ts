import { NextResponse } from "next/server";

import { InpiApiError } from "@/lib/api/inpi";
import { InpiAuthError } from "@/lib/api/inpi-auth";
import { CompaniesDbError, getOrFetchDirigeants } from "@/lib/db/companies";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/companies/[siren]
 * Returns the dirigeants (from INPI / cached) for a SIREN.
 * Auth required. Works for any SIREN — the row need not exist in DB.
 */
export async function GET(
  _request: Request,
  { params }: { params: { siren: string } },
) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const siren = params.siren.replace(/\D/g, "");
  if (siren.length !== 9) {
    return NextResponse.json({ error: "SIREN invalide" }, { status: 400 });
  }

  try {
    const result = await getOrFetchDirigeants(siren);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof InpiAuthError) {
      return NextResponse.json(
        { error: "INPI auth", detail: err.message },
        { status: 500 },
      );
    }
    if (err instanceof InpiApiError) {
      return NextResponse.json(
        { error: "INPI upstream", status: err.status, detail: err.message },
        { status: err.status === 429 ? 429 : 502 },
      );
    }
    if (err instanceof CompaniesDbError) {
      return NextResponse.json({ error: err.message }, { status: 500 });
    }
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}
