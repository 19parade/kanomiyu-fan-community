import { NextResponse } from "next/server";

import { requireActiveAdmin } from "@/lib/admin/authorize";
import { mapEventDbError } from "@/lib/events/errors";
import { isSameOriginRequest } from "@/lib/http/verify-same-origin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type ErrorCode =
  | "ORIGIN_INVALID"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "INVALID_REQUEST"
  | string; // widened for pass-through DB error codes (see mapEventDbError)

function errorResponse(code: ErrorCode, status: number) {
  return NextResponse.json({ error: code }, { status, headers: { "Cache-Control": "no-store" } });
}

const UUID_SHAPE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const VALID_STATUSES = new Set(["draft", "public", "cancelled"]);

/**
 * PATCH /api/admin/events/[id]/status
 *
 * Thin HTTP wrapper around set_event_status() (see PROJECT_SPEC.md 6.5 「M17」
 * / supabase/migrations/20260928010000_events_admin_status.sql, unchanged by
 * this phase). set_event_status itself remains the sole authority for which
 * status transitions are allowed — this route adds no transition rules of
 * its own beyond rejecting an obviously malformed status value. The edit UI
 * only offers buttons for transitions the DB actually allows (see
 * components/admin/events/EditEventForm.tsx), but the DB's own
 * INVALID_EVENT_TRANSITION remains the real enforcement.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSameOriginRequest(request)) {
    return errorResponse("ORIGIN_INVALID", 403);
  }

  let supabase;
  try {
    supabase = await createSupabaseServerClient();
  } catch (error) {
    console.error("set event status: failed to create Supabase client", error);
    return errorResponse("EVENT_OPERATION_FAILED", 500);
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
    console.error("set event status: could not parse JSON body", error);
    return errorResponse("INVALID_REQUEST", 400);
  }

  if (typeof body !== "object" || body === null) {
    return errorResponse("INVALID_REQUEST", 400);
  }
  const b = body as Record<string, unknown>;

  const expectedUpdatedAt = b.expected_updated_at;
  if (typeof expectedUpdatedAt !== "string" || expectedUpdatedAt.length === 0) {
    return errorResponse("INVALID_EVENT_VERSION", 400);
  }

  const targetStatus = b.new_status;
  if (typeof targetStatus !== "string" || !VALID_STATUSES.has(targetStatus)) {
    return errorResponse("INVALID_EVENT_STATUS", 400);
  }

  const { error: statusError } = await supabase.rpc("set_event_status", {
    target_event_id: id,
    new_status: targetStatus,
    expected_updated_at: expectedUpdatedAt,
  });

  if (statusError) {
    const mapped = mapEventDbError(statusError.message);
    return errorResponse(mapped.code, mapped.status);
  }

  const { data: afterRows, error: afterError } = await supabase.rpc("get_admin_event", {
    target_event_id: id,
  });

  if (afterError || !Array.isArray(afterRows) || !afterRows[0]) {
    console.error("set event status: post-update re-fetch failed", afterError?.message);
    return errorResponse("EVENT_OPERATION_FAILED", 500);
  }

  return NextResponse.json(
    { updated_at: afterRows[0].updated_at, status: afterRows[0].status },
    { status: 200, headers: { "Cache-Control": "no-store" } }
  );
}
