import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

import { requireActiveAdmin } from "@/lib/admin/authorize";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase/server";
import { validateSongImage } from "@/lib/song-images/validate";

// This route touches the request body, cookies, and Supabase — it must run
// on the Node.js runtime (the default; the Edge runtime is deprecated in
// this Next.js version and is never appropriate for Buffer/crypto usage
// here).
export const runtime = "nodejs";

const BUCKET = "song-images";
const STORAGE_CACHE_CONTROL = "31536000"; // 1 year: keys are random UUIDs and are never overwritten (ST2: no UPDATE policy).

/**
 * Stable, client-facing error codes for this endpoint. Internal details
 * (SQL/Storage error text, stack traces) are never forwarded to the caller;
 * they are only logged server-side.
 */
type UploadErrorCode =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "INVALID_UPLOAD"
  | "FILE_TOO_LARGE"
  | "UNSUPPORTED_IMAGE_TYPE"
  | "IMAGE_TYPE_MISMATCH"
  | "UPLOAD_FAILED";

function errorResponse(code: UploadErrorCode, status: number) {
  return NextResponse.json(
    { error: code },
    { status, headers: { "Cache-Control": "no-store" } }
  );
}

/**
 * POST /api/admin/music/images
 *
 * Upload primitive only (ST3). This endpoint:
 *   - authenticates the caller and requires an active admin (see
 *     lib/admin/authorize.ts) before touching Storage,
 *   - accepts exactly one image file (multipart/form-data, field "file"),
 *   - validates size and binary format server-side (never trusts the
 *     client-declared Content-Type alone — see lib/song-images/validate.ts),
 *   - uploads it to the `song-images` bucket under a fresh, random UUID key
 *     with upsert disabled, using a user-scoped Supabase client so Storage
 *     RLS (song_images_admin_insert) is actually evaluated for this request,
 *   - returns only the generated object key.
 *
 * It deliberately does NOT call create_song / update_song / set_song_status,
 * does not resolve a public URL, and does not delete anything. A successful
 * upload that is never attached to a song becomes an orphan; cleanup is a
 * separate, not-yet-implemented phase (ST5). See the ST3 report for the
 * full set of intentional exclusions.
 */
export async function POST(request: Request) {
  let supabase;
  try {
    supabase = await createSupabaseRouteHandlerClient();
  } catch (error) {
    console.error("song image upload: failed to create Supabase client", error);
    return errorResponse("UPLOAD_FAILED", 500);
  }

  const authResult = await requireActiveAdmin(supabase);
  if (!authResult.authorized) {
    return authResult.reason === "UNAUTHENTICATED"
      ? errorResponse("UNAUTHORIZED", 401)
      : errorResponse("FORBIDDEN", 403);
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch (error) {
    console.error("song image upload: could not parse multipart body", error);
    return errorResponse("INVALID_UPLOAD", 400);
  }

  const entries = formData.getAll("file");
  if (entries.length !== 1 || !(entries[0] instanceof Blob)) {
    // Covers: missing file, more than one file, or a non-file "file" field.
    return errorResponse("INVALID_UPLOAD", 400);
  }

  const file = entries[0];
  const declaredMime = typeof file.type === "string" ? file.type : "";

  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await file.arrayBuffer());
  } catch (error) {
    console.error("song image upload: could not read file bytes", error);
    return errorResponse("INVALID_UPLOAD", 400);
  }

  const validation = validateSongImage(bytes, declaredMime);
  if (!validation.ok) {
    switch (validation.error) {
      case "EMPTY_FILE":
        return errorResponse("INVALID_UPLOAD", 400);
      case "FILE_TOO_LARGE":
        return errorResponse("FILE_TOO_LARGE", 413);
      case "UNSUPPORTED_IMAGE_TYPE":
        return errorResponse("UNSUPPORTED_IMAGE_TYPE", 415);
      case "IMAGE_TYPE_MISMATCH":
        return errorResponse("IMAGE_TYPE_MISMATCH", 415);
    }
  }

  const key = `${randomUUID()}.${validation.extension}`;

  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(key, bytes, {
    contentType: validation.mime,
    cacheControl: STORAGE_CACHE_CONTROL,
    upsert: false,
  });

  if (uploadError) {
    // Never forward Storage's raw error text (it can reveal RLS internals).
    console.error("song image upload: Storage upload failed", uploadError.message);
    return errorResponse("UPLOAD_FAILED", 502);
  }

  return NextResponse.json(
    { key },
    { status: 201, headers: { "Cache-Control": "no-store" } }
  );
}
