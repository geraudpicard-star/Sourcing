import { NextResponse } from "next/server";

import { InseeApiError, searchInsee } from "@/lib/api/insee";
import { InseeAuthError } from "@/lib/api/insee-auth";
import {
  readCache,
  searchCacheKey,
  writeCache,
} from "@/lib/db/companies";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { SearchFiltersSchema, type SearchResult } from "@/types/company";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  // 1. Auth gate
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Validate input
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = SearchFiltersSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid filters", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const filters = parsed.data;

  // 3. Cache lookup (server-side only; avoids hammering INSEE)
  const key = searchCacheKey(filters);
  const cached = await readCache(key);
  if (cached) {
    const payload: SearchResult = {
      companies: cached.companies,
      total: cached.total,
      page: filters.page,
      pageSize: filters.pageSize,
      fromCache: true,
    };
    return NextResponse.json(payload);
  }

  // 4. INSEE call
  try {
    const { companies, total } = await searchInsee({ filters });
    // Fire-and-forget cache write; do not block response on cache errors.
    writeCache(key, companies, total).catch(() => {});

    const payload: SearchResult = {
      companies,
      total,
      page: filters.page,
      pageSize: filters.pageSize,
      fromCache: false,
    };
    return NextResponse.json(payload);
  } catch (err) {
    if (err instanceof InseeAuthError) {
      return NextResponse.json(
        { error: "INSEE auth misconfigured", detail: err.message },
        { status: 500 },
      );
    }
    if (err instanceof InseeApiError) {
      const upstream = err.status;
      const status =
        upstream === 429 ? 429 : upstream >= 500 ? 502 : upstream === 400 ? 400 : 502;
      return NextResponse.json(
        { error: "INSEE upstream error", status: upstream, detail: err.message },
        { status },
      );
    }
    return NextResponse.json(
      { error: "Unexpected server error" },
      { status: 500 },
    );
  }
}
