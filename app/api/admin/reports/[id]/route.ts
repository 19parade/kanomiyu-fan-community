import { NextResponse } from "next/server";

import { requireActiveAdmin } from "@/lib/admin/authorize";
import { mapProcessReportDbError } from "@/lib/admin/reports/errors";
import { isSameOriginRequest } from "@/lib/http/verify-same-origin";
import { fetchAuthorsByIds } from "@/lib/posts/authors";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type ErrorCode = "ORIGIN_INVALID" | "UNAUTHORIZED" | "FORBIDDEN" | "INVALID_REQUEST" | string;

function errorResponse(code: ErrorCode, status: number) {
  return NextResponse.json({ error: code }, { status, headers: { "Cache-Control": "no-store" } });
}

const UUID_SHAPE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const VALID_STATUSES = new Set(["pending", "reviewing", "resolved", "rejected"]);

/**
 * PATCH /api/admin/reports/[id]
 *
 * F5-D4b: thin HTTP wrapper around the existing public.process_report()
 * RPC (supabase/migrations/20260927150000_process_report_rpc.sql), which
 * is reused unchanged and remains the sole authority for admin
 * authorization, the transition table, handled_by/handled_at, and the
 * admin_logs audit write. This route adds no transition rules of its own
 * beyond rejecting an obviously malformed request body — same division of
 * responsibility as PATCH /api/admin/music/[id]/status.
 *
 * process_report() returns void, so after a successful call this re-fetches
 * the single report row (via reports_select_admin, the same RLS path the
 * list route uses) to hand the client the definitive current status /
 * handled_by / handled_at rather than the client assuming its own
 * optimistic guess.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSameOriginRequest(request)) {
    return errorResponse("ORIGIN_INVALID", 403);
  }

  let supabase;
  try {
    supabase = await createSupabaseServerClient();
  } catch (error) {
    console.error("process report: failed to create Supabase client", error);
    return errorResponse("REPORT_PROCESSING_FAILED", 500);
  }

  const authResult = await requireActiveAdmin(supabase);
  if (!authResult.authorized) {
    return authResult.reason === "UNAUTHENTICATED"
      ? errorResponse("UNAUTHORIZED", 401)
      : errorResponse("FORBIDDEN", 403);
  }

  const { id } = await params;
  if (!UUID_SHAPE.test(id)) {
    return errorResponse("INVALID_REQUEST", 400);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch (error) {
    console.error("process report: could not parse JSON body", error);
    return errorResponse("INVALID_REQUEST", 400);
  }

  if (typeof body !== "object" || body === null) {
    return errorResponse("INVALID_REQUEST", 400);
  }

  const newStatusValue = (body as Record<string, unknown>).new_status;
  if (typeof newStatusValue !== "string" || !VALID_STATUSES.has(newStatusValue)) {
    return errorResponse("INVALID_REPORT_STATUS", 400);
  }

  const noteValue = (body as Record<string, unknown>).note;
  const note = typeof noteValue === "string" && noteValue.length > 0 ? noteValue : null;

  const { error: processError } = await supabase.rpc("process_report", {
    target_report_id: id,
    new_status: newStatusValue,
    note,
  });

  if (processError) {
    const mapped = mapProcessReportDbError(processError.message);
    return errorResponse(mapped.code, mapped.status);
  }

  const { data: afterRow, error: afterError } = await supabase
    .from("reports")
    .select("id, target_type, target_id, reason, detail, status, handled_by, handled_at, created_at, updated_at")
    .eq("id", id)
    .maybeSingle();

  if (afterError || !afterRow) {
    console.error("process report: post-update re-fetch failed", afterError?.message);
    return errorResponse("REPORT_PROCESSING_FAILED", 500);
  }

  let handledByDisplayName: string | null = null;
  if (afterRow.handled_by) {
    const lookup = await fetchAuthorsByIds(supabase, [afterRow.handled_by]);
    if (lookup.ok) {
      handledByDisplayName = lookup.authors.get(afterRow.handled_by)?.display_name ?? null;
    }
  }

  return NextResponse.json(
    { report: { ...afterRow, handled_by_display_name: handledByDisplayName } },
    { status: 200, headers: { "Cache-Control": "no-store" } }
  );
}
