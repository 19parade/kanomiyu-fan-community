import { NextResponse } from "next/server";

import { requireActiveAdmin } from "@/lib/admin/authorize";
import { isSameOriginRequest } from "@/lib/http/verify-same-origin";
import { mapSongDbError } from "@/lib/song-images/errors";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// Touches cookies and Supabase — Node.js runtime required (Edge is
// deprecated in this Next.js version), matching the sibling routes.
export const runtime = "nodejs";

type ErrorCode =
  | "ORIGIN_INVALID"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "INVALID_REQUEST"
  | "INVALID_SONG_VERSION"
  | "INVALID_SONG_STATUS"
  | "SONG_NOT_FOUND"
  | string; // widened for pass-through DB error codes (see mapSongDbError)

function errorResponse(code: ErrorCode, status: number) {
  return NextResponse.json({ error: code }, { status, headers: { "Cache-Control": "no-store" } });
}

const UUID_SHAPE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const VALID_STATUSES = new Set(["draft", "public"]);

/**
 * PATCH /api/admin/music/[id]/status
 *
 * Business operation "change a song's publication status" (A5). Thin HTTP
 * wrapper around the existing set_song_status RPC (S7 — see
 * supabase/migrations/20260928130000_songs_admin_status.sql), which is
 * reused unchanged and remains the sole authority for the authorization
 * check, the version-conflict check, the no-op/actual-change distinction,
 * and the admin_logs audit write. This route adds no transition rules of
 * its own beyond rejecting an obviously malformed request body.
 *
 * Unlike the sibling content-update route, this request body is JSON (per
 * spec) — there is no file involved, so an explicit `Content-Type:
 * application/json` from the browser is expected and fine here; this is
 * not the "never set Content-Type" multipart case.
 *
 * expected_updated_at is read and forwarded as the exact raw request
 * string, never JS-Date-converted or reformatted — set_song_status's own
 * equality check against the current updated_at is the sole concurrency
 * arbiter. Content edits (PATCH /api/admin/music/[id]) and status changes
 * (this route) share the same updated_at version lineage on purpose (see
 * the migration's own doc comment) — this route does not special-case that,
 * it simply forwards whatever token the caller holds.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSameOriginRequest(request)) {
    return errorResponse("ORIGIN_INVALID", 403);
  }

  let supabase;
  try {
    supabase = await createSupabaseServerClient();
  } catch (error) {
    console.error("set song status: failed to create Supabase client", error);
    return errorResponse("SONG_OPERATION_FAILED", 500);
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
    console.error("set song status: could not parse JSON body", error);
    return errorResponse("INVALID_REQUEST", 400);
  }

  if (typeof body !== "object" || body === null) {
    return errorResponse("INVALID_REQUEST", 400);
  }

  const expectedUpdatedAtValue = (body as Record<string, unknown>).expected_updated_at;
  if (typeof expectedUpdatedAtValue !== "string" || expectedUpdatedAtValue.length === 0) {
    return errorResponse("INVALID_SONG_VERSION", 400);
  }
  // Kept as the exact raw string from the request body — never parsed into
  // a JS Date and never reformatted.
  const expectedUpdatedAt = expectedUpdatedAtValue;

  const targetStatusValue = (body as Record<string, unknown>).target_status;
  if (typeof targetStatusValue !== "string" || !VALID_STATUSES.has(targetStatusValue)) {
    // Exact match only ('draft' | 'public') — same error code the RPC
    // itself would raise for an invalid target_status, reused here to fail
    // fast without a round trip for an obviously bad value.
    return errorResponse("INVALID_SONG_STATUS", 400);
  }
  const targetStatus = targetStatusValue as "draft" | "public";

  const { data: statusChanged, error: statusError } = await supabase.rpc("set_song_status", {
    target_song_id: id,
    expected_updated_at: expectedUpdatedAt,
    target_status: targetStatus,
  });

  if (statusError) {
    const mapped = mapSongDbError(statusError.message);
    return errorResponse(mapped.code, mapped.status);
  }

  // Re-fetch to return the definitive, current updated_at and status (the
  // version token and state the caller needs next), as the raw strings
  // get_admin_song returns — never JS-Date-converted. Mirrors the existing
  // content PATCH route's same re-fetch-after-mutation pattern.
  const { data: afterRows, error: afterError } = await supabase.rpc("get_admin_song", {
    target_song_id: id,
  });

  if (afterError || !Array.isArray(afterRows) || !afterRows[0]) {
    console.error("set song status: post-update re-fetch failed", afterError?.message);
    return errorResponse("SONG_OPERATION_FAILED", 500);
  }

  return NextResponse.json(
    {
      updated: statusChanged === true,
      updated_at: afterRows[0].updated_at,
      status: afterRows[0].status,
    },
    { status: 200, headers: { "Cache-Control": "no-store" } }
  );
}
