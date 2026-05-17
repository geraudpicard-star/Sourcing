import { NextResponse } from "next/server";
import { z } from "zod";

import { CompaniesDbError, saveCompaniesAsSession } from "@/lib/db/companies";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CompanySchema = z.object({
  siren: z.string().min(9).max(9),
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

const FiltersSchema = z
  .object({
    nafCode: z.string().optional(),
    department: z.string().optional(),
    commune: z.string().optional(),
    minAgeYears: z.number().int().optional(),
    employeeRangeCodes: z.array(z.string()).optional(),
    activeOnly: z.boolean().optional(),
  })
  .passthrough()
  .default({});

const BodySchema = z.object({
  companies: z.array(CompanySchema).min(1).max(500),
  filters: FiltersSchema.optional(),
  label: z.string().trim().max(120).optional().nullable(),
});

export async function POST(request: Request) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const { sessionId, saved } = await saveCompaniesAsSession(
      parsed.data.companies,
      parsed.data.filters ?? {},
      parsed.data.label ?? null,
    );
    return NextResponse.json({ saved, sessionId });
  } catch (err) {
    if (err instanceof CompaniesDbError) {
      return NextResponse.json({ error: err.message }, { status: 500 });
    }
    return NextResponse.json(
      { error: "Unexpected server error" },
      { status: 500 },
    );
  }
}
