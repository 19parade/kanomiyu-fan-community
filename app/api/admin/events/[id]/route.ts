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
  | "EVENT_NOT_FOUND"
  | string; // widened for pass-through DB error codes (see mapEventDbError)

function errorResponse(code: ErrorCode, status: number) {
  return NextResponse.json({ error: code }, { status, headers: { "Cache-Control": "no-store" } });
}

const UUID_SHAPE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/**
 * PATCH /api/admin/events/[id]
 *
 * Thin HTTP wrapper around update_event() (see supabase/migrations/
 * 20261024000000_events_schedule_and_official_link.sql). Full-replacement
 * RPC: `image_url` is always resubmitted as the value the client currently
 * holds (LIVE機能 Phase 1 has no upload UI to change it, so the form always
 * sends back whatever `get_admin_event` last returned — never a guess).
 *
 * `expected_updated_at` is read and forwarded as the exact raw request
 * string, never JS-Date-converted — update_event's own equality check
 * against the current `updated_at` is the sole concurrency arbiter (same
 * precaution as app/api/admin/music/[id]/route.ts).
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSameOriginRequest(request)) {
    return errorResponse("ORIGIN_INVALID", 403);
  }

  let supabase;
  try {
    supabase = await createSupabaseServerClient();
  } catch (error) {
    console.error("update event: failed to create Supabase client", error);
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
    console.error("update event: could not parse JSON body", error);
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

  const title = b.title;
  const venue = b.venue;
  const eventDate = b.event_date;
  if (typeof title !== "string" || typeof venue !== "string" || typeof eventDate !== "string") {
    return errorResponse("INVALID_REQUEST", 400);
  }

  const asNullableString = (value: unknown): string | null =>
    typeof value === "string" && value.length > 0 ? value : null;

  const { error: updateError } = await supabase.rpc("update_event", {
    target_event_id: id,
    expected_updated_at: expectedUpdatedAt,
    title,
    venue,
    event_date: eventDate,
    description: asNullableString(b.description),
    image_url: asNullableString(b.image_url),
    ticket_url: asNullableString(b.ticket_url),
    doors_time: asNullableString(b.doors_time),
    start_time: asNullableString(b.start_time),
    official_url: asNullableString(b.official_url),
  });

  if (updateError) {
    const mapped = mapEventDbError(updateError.message);
    return errorResponse(mapped.code, mapped.status);
  }

  // Re-fetch to return the definitive current updated_at (the version token
  // the caller needs for its next PATCH) — mirrors the music admin routes'
  // same re-fetch-after-mutation pattern.
  const { data: afterRows, error: afterError } = await supabase.rpc("get_admin_event", {
    target_event_id: id,
  });

  if (afterError || !Array.isArray(afterRows) || !afterRows[0]) {
    console.error("update event: post-update re-fetch failed", afterError?.message);
    return errorResponse("EVENT_OPERATION_FAILED", 500);
  }

  return NextResponse.json(
    { updated_at: afterRows[0].updated_at },
    { status: 200, headers: { "Cache-Control": "no-store" } }
  );
}
