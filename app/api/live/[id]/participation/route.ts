import { NextResponse } from "next/server";

import { mapEventDbError } from "@/lib/events/errors";
import { isSameOriginRequest } from "@/lib/http/verify-same-origin";
import { resolveMemberAccess } from "@/lib/member/access";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function errorResponse(code: string, status: number) {
  return NextResponse.json({ error: code }, { status, headers: { "Cache-Control": "no-store" } });
}

const UUID_SHAPE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const VALID_STATUSES = new Set(["going", "attended", "cancelled"]);

/**
 * PATCH /api/live/[id]/participation
 *
 * Thin HTTP wrapper around set_my_event_participation() (LIVE機能 Phase 2.
 * PROJECT_SPEC.md 6.6「M20」). That RPC always operates on `auth.uid()` —
 * there is no argument to target another user's row — so this route adds no
 * authorization logic of its own beyond requiring a signed-in, non-
 * suspended/banned caller (mirrors resolveMemberAccess()'s member_active /
 * admin_active, the same gate /feed uses for posting). `new_visibility` is
 * never read from the request body: this phase has no UI for choosing a
 * visibility, so the server always writes `'private'` (PROJECT_SPEC.md 6.6's
 * privacy-by-default) regardless of what a client might send.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSameOriginRequest(request)) {
    return errorResponse("ORIGIN_INVALID", 403);
  }

  const { id } = await params;
  if (!UUID_SHAPE.test(id)) {
    return errorResponse("INVALID_REQUEST", 400);
  }

  let supabase;
  try {
    supabase = await createSupabaseServerClient();
  } catch (error) {
    console.error("set event participation: failed to create Supabase client", error);
    return errorResponse("EVENT_OPERATION_FAILED", 500);
  }

  const access = await resolveMemberAccess(supabase);
  if (access.kind === "unauthenticated") {
    return errorResponse("UNAUTHORIZED", 401);
  }
  if (access.kind !== "member_active" && access.kind !== "admin_active") {
    return errorResponse("FORBIDDEN", 403);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch (error) {
    console.error("set event participation: could not parse JSON body", error);
    return errorResponse("INVALID_REQUEST", 400);
  }

  if (typeof body !== "object" || body === null) {
    return errorResponse("INVALID_REQUEST", 400);
  }
  const newStatus = (body as Record<string, unknown>).new_status;
  if (typeof newStatus !== "string" || !VALID_STATUSES.has(newStatus)) {
    return errorResponse("INVALID_PARTICIPATION_STATUS", 400);
  }

  const { data, error: rpcError } = await supabase.rpc("set_my_event_participation", {
    target_event_id: id,
    new_status: newStatus,
    // Never taken from the request body — see doc comment above.
    new_visibility: "private",
  });

  if (rpcError) {
    const mapped = mapEventDbError(rpcError.message);
    return errorResponse(mapped.code, mapped.status);
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row.status !== "string") {
    console.error("set event participation: unexpected RPC response shape", data);
    return errorResponse("EVENT_OPERATION_FAILED", 500);
  }

  return NextResponse.json(
    { status: row.status, visibility: row.visibility },
    { status: 200, headers: { "Cache-Control": "no-store" } }
  );
}
