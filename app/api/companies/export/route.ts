import { z } from "zod";

import { companiesToCsv } from "@/lib/csv";
import {
  getSessionWithCompanies,
  listAllSavedCompanies,
} from "@/lib/db/companies";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CompanySchema = z.object({
  siren: z.string(),
  siret: z.string().nullable(),
  denomination: z.string(),
  legalForm: z.string().nullable(),
  nafCode: z.string().nullable(),
  nafLabel: z.string().nullable(),
  creationDate: z.string().nullable(),
  ageYears: z.number().int().nullable(),
  employeeRange: z.string().nullable(),
  employeeRangeCode: z.string().nullable(),
  active: z.boolean(),
  address: z.object({
    street: z.string().nullable(),
    complement: z.string().nullable(),
    cedex: z.string().nullable(),
    postalCode: z.string().nullable(),
    city: z.string().nullable(),
    department: z.string().nullable(),
  }),
  source: z.literal("insee"),
  fetchedAt: z.string(),
});

const BodySchema = z
  .object({
    companies: z.array(CompanySchema).optional(),
    sessionId: z.string().uuid().optional(),
  })
  .optional();

/**
 * POST /api/companies/export
 *  - body { companies: [...] }   → exports the explicit list (current search results)
 *  - body { sessionId: "..." }   → exports the companies of that saved session
 *  - empty body                  → exports every saved company
 */
export async function POST(request: Request) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return new Response("Unauthorized", { status: 401 });
  }

  let raw: unknown = undefined;
  try {
    const text = await request.text();
    raw = text ? JSON.parse(text) : undefined;
  } catch {
    return new Response("Invalid JSON body", { status: 400 });
  }

  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return new Response("Invalid payload", { status: 400 });
  }

  let companies;
  let suffix = "";
  if (parsed.data?.companies) {
    companies = parsed.data.companies;
    suffix = "selection";
  } else if (parsed.data?.sessionId) {
    const session = await getSessionWithCompanies(parsed.data.sessionId);
    if (!session) return new Response("Session not found", { status: 404 });
    companies = session.companies;
    suffix = `session-${session.id.slice(0, 8)}`;
  } else {
    companies = await listAllSavedCompanies();
    suffix = "tout";
  }

  const csv = companiesToCsv(companies);
  const filename = `sourcing-${suffix}-${new Date().toISOString().slice(0, 10)}.csv`;

  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
