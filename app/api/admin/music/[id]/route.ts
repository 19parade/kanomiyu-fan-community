import { NextResponse } from "next/server";

import { requireActiveAdmin } from "@/lib/admin/authorize";
import { isSameOriginRequest } from "@/lib/http/verify-same-origin";
import { mapSongDbError } from "@/lib/song-images/errors";
import { deleteSongImageBestEffort } from "@/lib/song-images/delete";
import { uploadSongImage } from "@/lib/song-images/upload";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// Touches cookies, Supabase and (conditionally) file bytes — Node.js runtime
// required (Edge is deprecated in this Next.js version).
export const runtime = "nodejs";

type ErrorCode =
  | "ORIGIN_INVALID"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "INVALID_REQUEST"
  | "INVALID_SONG_VERSION"
  | "INVALID_SONG_RELEASE_DATE"
  | "INVALID_UPLOAD"
  | "FILE_TOO_LARGE"
  | "UNSUPPORTED_IMAGE_TYPE"
  | "IMAGE_TYPE_MISMATCH"
  | "UPLOAD_FAILED"
  | "SONG_NOT_FOUND"
  | string; // widened for pass-through DB error codes (see mapSongDbError)

function errorResponse(code: ErrorCode, status: number) {
  return NextResponse.json({ error: code }, { status, headers: { "Cache-Control": "no-store" } });
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const UUID_SHAPE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const COVER_ACTIONS = new Set(["keep", "replace", "remove"]);
type CoverAction = "keep" | "replace" | "remove";

/**
 * PATCH /api/admin/music/[id]
 *
 * Business operation "update song, with an explicit cover action" (ST4).
 * Reuses update_song (S6) unchanged; never calls set_song_status.
 *
 * cover_action is mandatory and explicit — never inferred from whether a
 * file was attached:
 *   - "keep":    no file allowed. cover_image_url is resubmitted unchanged
 *                (update_song is a full-replacement RPC — there is no
 *                partial-update mode, so "keep" must still pass the
 *                current value through).
 *   - "replace": file required. Upload first, then call update_song with
 *                the new key. On DB failure, compensate-delete the new
 *                object (it was never attached). On DB success, best-effort
 *                delete the old object (it is now superseded).
 *   - "remove":  no file allowed. Call update_song with cover_image_url
 *                explicitly null. On DB success, best-effort delete the old
 *                object.
 *
 * expected_updated_at is read and forwarded as the raw request string,
 * never JS-Date-converted (that would lose microsecond precision against
 * Postgres timestamptz and could turn a real conflict into a false match,
 * or vice versa). update_song's own equality check remains the sole
 * concurrency arbiter; the pre-fetch below is only to learn the *current*
 * cover_image_url (for keep/cleanup decisions) and to reject a nonexistent
 * song before doing any Storage work.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSameOriginRequest(request)) {
    return errorResponse("ORIGIN_INVALID", 403);
  }

  let supabase;
  try {
    supabase = await createSupabaseServerClient();
  } catch (error) {
    console.error("update song: failed to create Supabase client", error);
    return errorResponse("UPLOAD_FAILED", 500);
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

  // Existence check + current cover_image_url, before any Storage work.
  const { data: beforeRows, error: beforeError } = await supabase.rpc("get_admin_song", {
    target_song_id: id,
  });

  if (beforeError) {
    const mapped = mapSongDbError(beforeError.message);
    return errorResponse(mapped.code, mapped.status);
  }

  const before = Array.isArray(beforeRows) ? beforeRows[0] : undefined;
  if (!before) {
    return errorResponse("SONG_NOT_FOUND", 404);
  }
  const oldCoverImageKey: string | null = before.cover_image_url ?? null;

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch (error) {
    console.error("update song: could not parse multipart body", error);
    return errorResponse("INVALID_REQUEST", 400);
  }

  const expectedUpdatedAtEntry = formData.get("expected_updated_at");
  if (typeof expectedUpdatedAtEntry !== "string" || expectedUpdatedAtEntry.length === 0) {
    return errorResponse("INVALID_SONG_VERSION", 400);
  }
  // Kept as the exact raw string from the request body — never parsed into
  // a JS Date and never reformatted.
  const expectedUpdatedAt = expectedUpdatedAtEntry;

  const titleEntry = formData.get("title");
  if (typeof titleEntry !== "string") {
    return errorResponse("INVALID_REQUEST", 400);
  }
  const title = titleEntry;

  const releaseDateEntry = formData.get("release_date");
  let releaseDate: string | null = null;
  if (typeof releaseDateEntry === "string" && releaseDateEntry.length > 0) {
    if (!ISO_DATE.test(releaseDateEntry)) {
      return errorResponse("INVALID_SONG_RELEASE_DATE", 400);
    }
    releaseDate = releaseDateEntry;
  }

  const descriptionEntry = formData.get("description");
  const description = typeof descriptionEntry === "string" ? descriptionEntry : null;

  const coverActionEntry = formData.get("cover_action");
  if (typeof coverActionEntry !== "string" || !COVER_ACTIONS.has(coverActionEntry)) {
    // Exact lowercase match only — no trim/normalize (frozen contract).
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

  let newCoverImageKey: string | null = null;
  if (coverAction === "replace") {
    // file !== null guaranteed by the check above.
    const uploadResult = await uploadSongImage(supabase, file as Blob);
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
    newCoverImageKey = uploadResult.key;
  }

  // The cover_image_url value actually sent to update_song (a full-replacement
  // RPC — there is no partial-update mode):
  //   keep    -> resubmit the current value unchanged
  //   replace -> the freshly uploaded key
  //   remove  -> explicit null
  const coverImageParam: string | null =
    coverAction === "keep" ? oldCoverImageKey : coverAction === "replace" ? newCoverImageKey : null;

  const { data: updated, error: updateError } = await supabase.rpc("update_song", {
    target_song_id: id,
    expected_updated_at: expectedUpdatedAt,
    title,
    release_date: releaseDate,
    cover_image_url: coverImageParam,
    description,
  });

  if (updateError) {
    if (coverAction === "replace" && newCoverImageKey !== null) {
      // Compensation: the new object was never attached to any song, so it
      // cannot legitimately be "still referenced" — but the delete remains
      // best-effort and its outcome never changes this response.
      await deleteSongImageBestEffort(supabase, newCoverImageKey);
    }
    const mapped = mapSongDbError(updateError.message);
    return errorResponse(mapped.code, mapped.status);
  }

  // Best-effort cleanup of the now-superseded old object. Never attempted
  // for "keep" (the old key is still the current one). A non-"deleted"
  // outcome (still referenced by another song, already gone, or a transient
  // Storage error) is not checked here and never changes this response —
  // see lib/song-images/delete.ts.
  if ((coverAction === "replace" || coverAction === "remove") && oldCoverImageKey !== null) {
    await deleteSongImageBestEffort(supabase, oldCoverImageKey);
  }

  // Re-fetch to return the definitive, current updated_at (the version
  // token the caller needs for its next PATCH), as the raw string
  // get_admin_song returns — never JS-Date-converted.
  const { data: afterRows, error: afterError } = await supabase.rpc("get_admin_song", {
    target_song_id: id,
  });

  if (afterError || !Array.isArray(afterRows) || !afterRows[0]) {
    console.error("update song: post-update re-fetch failed", afterError?.message);
    return errorResponse("SONG_OPERATION_FAILED", 500);
  }

  return NextResponse.json(
    { updated: updated === true, updated_at: afterRows[0].updated_at },
    { status: 200, headers: { "Cache-Control": "no-store" } }
  );
}
