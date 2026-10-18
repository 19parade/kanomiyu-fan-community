import { NextResponse } from "next/server";

import { requireActiveAdmin } from "@/lib/admin/authorize";
import { fetchAdminReports } from "@/lib/admin/reports/list";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type ErrorCode = "UNAUTHORIZED" | "FORBIDDEN" | "INVALID_REQUEST" | "REPORT_LIST_FAILED";

function errorResponse(code: ErrorCode, status: number) {
  return NextResponse.json({ error: code }, { status, headers: { "Cache-Control": "no-store" } });
}

const UUID_SHAPE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const ISO_TIMESTAMP_SHAPE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;
const VALID_STATUSES = new Set(["pending", "reviewing", "resolved", "rejected"]);

/**
 * GET /api/admin/reports
 *
 * F5-D4b: admin-only report list. There is no admin-list RPC for reports
 * (unlike get_admin_songs() for Songs) — the sole existing read path is
 * reports_select_admin (supabase/migrations/20260927110000_reports_rls.sql,
 * `USING (public.is_admin())`, no row filter beyond that). This route is a
 * thin wrapper over lib/admin/reports/list.ts's shared query (also used by
 * app/admin/reports/page.tsx's initial render), itself a column-limited
 * direct SELECT via the user-scoped server client (never service_role) —
 * adding a new RPC/migration for this was explicitly out of scope this
 * phase (a direct SELECT needed none, so this was not a STOP condition).
 *
 * `reporter_id` is deliberately never selected or returned — see
 * lib/admin/reports/list.ts's doc comment.
 */
export async function GET(request: Request) {
  let supabase;
  try {
    supabase = await createSupabaseServerClient();
  } catch (error) {
    console.error("admin reports list: failed to create Supabase client", error);
    return errorResponse("REPORT_LIST_FAILED", 500);
  }

  const authResult = await requireActiveAdmin(supabase);
  if (!authResult.authorized) {
    return authResult.reason === "UNAUTHENTICATED"
      ? errorResponse("UNAUTHORIZED", 401)
      : errorResponse("FORBIDDEN", 403);
  }

  const url = new URL(request.url);
  const statusFilter = url.searchParams.get("status");
  const afterCreatedAt = url.searchParams.get("after_created_at");
  const afterId = url.searchParams.get("after_id");

  if (statusFilter !== null && !VALID_STATUSES.has(statusFilter)) {
    return errorResponse("INVALID_REQUEST", 400);
  }
  if ((afterCreatedAt === null) !== (afterId === null)) {
    return errorResponse("INVALID_REQUEST", 400);
  }
  if (afterId !== null && !UUID_SHAPE.test(afterId)) {
    return errorResponse("INVALID_REQUEST", 400);
  }
  if (afterCreatedAt !== null && !ISO_TIMESTAMP_SHAPE.test(afterCreatedAt)) {
    return errorResponse("INVALID_REQUEST", 400);
  }

  const result = await fetchAdminReports(supabase, { statusFilter, afterCreatedAt, afterId });

  if (!result.ok) {
    return errorResponse("REPORT_LIST_FAILED", 500);
  }

  return NextResponse.json(
    { reports: result.reports, has_more: result.hasMore },
    { status: 200, headers: { "Cache-Control": "no-store" } }
  );
}
