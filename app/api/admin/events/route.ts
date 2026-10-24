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
  | "LIST_FAILED"
  | string; // widened for pass-through DB error codes (see mapEventDbError)

function errorResponse(code: ErrorCode, status: number) {
  return NextResponse.json({ error: code }, { status, headers: { "Cache-Control": "no-store" } });
}

const UUID_SHAPE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const LIST_PAGE_SIZE = 20; // server-fixed, not client-configurable (mirrors A2's music list).

/**
 * GET /api/admin/events
 *
 * Read-only admin event list. Thin HTTP wrapper around get_admin_events()
 * (see supabase/migrations/20260927210000_events_admin_list.sql), which
 * remains the sole authority for search/status validation, keyset cursor
 * semantics, and ordering. `page_size` is fixed server-side; `has_more` is
 * computed here (rows returned === LIST_PAGE_SIZE) since the RPC returns no
 * total count.
 */
export async function GET(request: Request) {
  let supabase;
  try {
    supabase = await createSupabaseServerClient();
  } catch (error) {
    console.error("list events: failed to create Supabase client", error);
    return errorResponse("LIST_FAILED", 500);
  }

  const authResult = await requireActiveAdmin(supabase);
  if (!authResult.authorized) {
    return authResult.reason === "UNAUTHENTICATED"
      ? errorResponse("UNAUTHORIZED", 401)
      : errorResponse("FORBIDDEN", 403);
  }

  const url = new URL(request.url);
  const search = url.searchParams.get("search");
  const status = url.searchParams.get("status");
  const afterEventDate = url.searchParams.get("after_event_date");
  const afterId = url.searchParams.get("after_id");

  if (status !== null && status !== "draft" && status !== "public" && status !== "cancelled") {
    return errorResponse("INVALID_EVENT_STATUS_FILTER", 400);
  }

  if (afterId !== null && !UUID_SHAPE.test(afterId)) {
    return errorResponse("INVALID_EVENT_CURSOR", 400);
  }

  const { data, error } = await supabase.rpc("get_admin_events", {
    search,
    status_filter: status,
    after_event_date: afterEventDate,
    after_id: afterId,
    page_size: LIST_PAGE_SIZE,
  });

  if (error) {
    const mapped = mapEventDbError(error.message);
    return errorResponse(mapped.code, mapped.status);
  }

  const events = data ?? [];

  return NextResponse.json(
    { events, has_more: events.length === LIST_PAGE_SIZE },
    { status: 200, headers: { "Cache-Control": "no-store" } }
  );
}

/**
 * POST /api/admin/events
 *
 * Thin HTTP wrapper around create_event() (unchanged in its authorization/
 * normalization behavior by this phase — only its signature grew 3 trailing
 * optional params, see supabase/migrations/20261024000000_events_schedule_
 * and_official_link.sql). JSON body (no file upload — LIVE機能 Phase 1 has
 * no key-visual upload UI; `image_url` is always sent as null).
 *
 * Always creates a draft (create_event's own contract) — this route sends
 * no `status`.
 */
export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return errorResponse("ORIGIN_INVALID", 403);
  }

  let supabase;
  try {
    supabase = await createSupabaseServerClient();
  } catch (error) {
    console.error("create event: failed to create Supabase client", error);
    return errorResponse("EVENT_OPERATION_FAILED", 500);
  }

  const authResult = await requireActiveAdmin(supabase);
  if (!authResult.authorized) {
    return authResult.reason === "UNAUTHENTICATED"
      ? errorResponse("UNAUTHORIZED", 401)
      : errorResponse("FORBIDDEN", 403);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch (error) {
    console.error("create event: could not parse JSON body", error);
    return errorResponse("INVALID_REQUEST", 400);
  }

  if (typeof body !== "object" || body === null) {
    return errorResponse("INVALID_REQUEST", 400);
  }
  const b = body as Record<string, unknown>;

  const title = b.title;
  const venue = b.venue;
  const eventDate = b.event_date;
  if (typeof title !== "string" || typeof venue !== "string" || typeof eventDate !== "string") {
    return errorResponse("INVALID_REQUEST", 400);
  }

  const asNullableString = (value: unknown): string | null =>
    typeof value === "string" && value.length > 0 ? value : null;

  const { data: eventId, error: createError } = await supabase.rpc("create_event", {
    title,
    venue,
    event_date: eventDate,
    description: asNullableString(b.description),
    image_url: null,
    ticket_url: asNullableString(b.ticket_url),
    doors_time: asNullableString(b.doors_time),
    start_time: asNullableString(b.start_time),
    official_url: asNullableString(b.official_url),
  });

  if (createError) {
    const mapped = mapEventDbError(createError.message);
    return errorResponse(mapped.code, mapped.status);
  }

  return NextResponse.json({ id: eventId }, { status: 201, headers: { "Cache-Control": "no-store" } });
}
