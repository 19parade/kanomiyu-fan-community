import { NextResponse } from "next/server";

import { requireActiveAdmin } from "@/lib/admin/authorize";
import { deleteEventImageBestEffort } from "@/lib/event-images/delete";
import { uploadEventImage } from "@/lib/event-images/upload";
import { mapEventDbError } from "@/lib/events/errors";
import { isSameOriginRequest } from "@/lib/http/verify-same-origin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// Touches cookies, Supabase and (conditionally) file bytes — Node.js runtime
// required (Edge is deprecated in this Next.js version).
export const runtime = "nodejs";

type ErrorCode =
  | "ORIGIN_INVALID"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "INVALID_REQUEST"
  | "EVENT_NOT_FOUND"
  | "INVALID_UPLOAD"
  | "FILE_TOO_LARGE"
  | "UNSUPPORTED_IMAGE_TYPE"
  | "IMAGE_TYPE_MISMATCH"
  | "UPLOAD_FAILED"
  | string; // widened for pass-through DB error codes (see mapEventDbError)

function errorResponse(code: ErrorCode, status: number) {
  return NextResponse.json({ error: code }, { status, headers: { "Cache-Control": "no-store" } });
}

const UUID_SHAPE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const COVER_ACTIONS = new Set(["keep", "replace", "remove"]);
type CoverAction = "keep" | "replace" | "remove";

/**
 * PATCH /api/admin/events/[id]
 *
 * Thin HTTP wrapper around update_event() (see supabase/migrations/
 * 20261024000000_events_schedule_and_official_link.sql), extended in LIVE機能
 * Phase 4-A to also manage the key-visual image, mirroring
 * app/api/admin/music/[id]/route.ts's `cover_action` design exactly:
 *   - "keep":    no file allowed. image_url is resubmitted unchanged (full-
 *                replacement RPC — there is no partial-update mode).
 *   - "replace": file required. Upload first, then call update_event with
 *                the new key. On DB failure, compensate-delete the new
 *                object (it was never attached). On DB success, best-effort
 *                delete the old object (it is now superseded).
 *   - "remove":  no file allowed. Call update_event with image_url
 *                explicitly null. On DB success, best-effort delete the old
 *                object.
 *
 * Body is now multipart FormData (not JSON) so a file can be attached. All
 * other fields (title/venue/event_date/description/ticket_url/doors_time/
 * start_time/official_url/expected_updated_at) are read from FormData string
 * fields with the exact same validation as before.
 *
 * `expected_updated_at` is read and forwarded as the raw request string,
 * never JS-Date-converted — update_event's own equality check against the
 * current `updated_at` remains the sole concurrency arbiter.
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

  // Existence check + current image_url, before any Storage work (same
  // precaution as app/api/admin/music/[id]/route.ts).
  const { data: beforeRows, error: beforeError } = await supabase.rpc("get_admin_event", {
    target_event_id: id,
  });

  if (beforeError) {
    const mapped = mapEventDbError(beforeError.message);
    return errorResponse(mapped.code, mapped.status);
  }

  const before = Array.isArray(beforeRows) ? beforeRows[0] : undefined;
  if (!before) {
    return errorResponse("EVENT_NOT_FOUND", 404);
  }
  const oldImageKey: string | null = before.image_url ?? null;

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch (error) {
    console.error("update event: could not parse multipart body", error);
    return errorResponse("INVALID_REQUEST", 400);
  }

  const asString = (value: FormDataEntryValue | null): string | null =>
    typeof value === "string" ? value : null;
  const asNullableString = (value: FormDataEntryValue | null): string | null => {
    const s = asString(value);
    return s !== null && s.length > 0 ? s : null;
  };

  const expectedUpdatedAt = asString(formData.get("expected_updated_at"));
  if (!expectedUpdatedAt) {
    return errorResponse("INVALID_EVENT_VERSION", 400);
  }

  const title = asString(formData.get("title"));
  const venue = asString(formData.get("venue"));
  const eventDate = asString(formData.get("event_date"));
  if (title === null || venue === null || eventDate === null) {
    return errorResponse("INVALID_REQUEST", 400);
  }

  const coverActionEntry = asString(formData.get("cover_action"));
  if (coverActionEntry === null || !COVER_ACTIONS.has(coverActionEntry)) {
    return errorResponse("INVALID_REQUEST", 400);
  }
  const coverAction = coverActionEntry as CoverAction;

  const fileEntries = formData.getAll("file");
  if (fileEntries.length > 1) {
    return errorResponse("INVALID_REQUEST", 400);
  }
  const file = fileEntries.length === 1 ? fileEntries[0] : null;
  if (file !== null && !(file instanceof Blob)) {
    return errorResponse("INVALID_REQUEST", 400);
  }

  if (coverAction === "replace" && file === null) {
    return errorResponse("INVALID_REQUEST", 400);
  }
  if (coverAction !== "replace" && file !== null) {
    return errorResponse("INVALID_REQUEST", 400);
  }

  let newImageKey: string | null = null;
  if (coverAction === "replace") {
    // file !== null guaranteed by the check above.
    const uploadResult = await uploadEventImage(supabase, file as Blob);
    if (!uploadResult.ok) {
      switch (uploadResult.error) {
        case "EMPTY_FILE":
          return errorResponse("INVALID_UPLOAD", 400);
        case "FILE_TOO_LARGE":
          return errorResponse("FILE_TOO_LARGE", 413);
        case "UNSUPPORTED_IMAGE_TYPE":
          return errorResponse("UNSUPPORTED_IMAGE_TYPE", 415);
        case "IMAGE_TYPE_MISMATCH":
          return errorResponse("IMAGE_TYPE_MISMATCH", 415);
        case "UPLOAD_FAILED":
          return errorResponse("UPLOAD_FAILED", 502);
      }
    }
    newImageKey = uploadResult.key;
  }

  // The image_url value actually sent to update_event (a full-replacement
  // RPC — there is no partial-update mode):
  //   keep    -> resubmit the current value unchanged
  //   replace -> the freshly uploaded key
  //   remove  -> explicit null
  const imageUrlParam: string | null =
    coverAction === "keep" ? oldImageKey : coverAction === "replace" ? newImageKey : null;

  const { error: updateError } = await supabase.rpc("update_event", {
    target_event_id: id,
    expected_updated_at: expectedUpdatedAt,
    title,
    venue,
    event_date: eventDate,
    description: asNullableString(formData.get("description")),
    image_url: imageUrlParam,
    ticket_url: asNullableString(formData.get("ticket_url")),
    doors_time: asNullableString(formData.get("doors_time")),
    start_time: asNullableString(formData.get("start_time")),
    official_url: asNullableString(formData.get("official_url")),
  });

  if (updateError) {
    if (coverAction === "replace" && newImageKey !== null) {
      // Compensation: the new object was never attached to any event, so it
      // cannot legitimately be "still referenced" — but the delete remains
      // best-effort and its outcome never changes this response.
      await deleteEventImageBestEffort(supabase, newImageKey);
    }
    const mapped = mapEventDbError(updateError.message);
    return errorResponse(mapped.code, mapped.status);
  }

  // Best-effort cleanup of the now-superseded old object. Never attempted
  // for "keep" (the old key is still the current one). A non-"deleted"
  // outcome (still referenced by another event, already gone, or a
  // transient Storage error) is not checked here and never changes this
  // response — see lib/event-images/delete.ts.
  if ((coverAction === "replace" || coverAction === "remove") && oldImageKey !== null) {
    await deleteEventImageBestEffort(supabase, oldImageKey);
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
    { updated_at: afterRows[0].updated_at, image_url: afterRows[0].image_url },
    { status: 200, headers: { "Cache-Control": "no-store" } }
  );
}
