import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

import { validateSongImage, type SongImageValidationError } from "./validate";

const BUCKET = "song-images";
// 1 year: keys are random UUIDs and are never overwritten (ST2 has no
// storage.objects UPDATE policy for this bucket, so a key's content is
// immutable for its lifetime).
const STORAGE_CACHE_CONTROL = "31536000";

export type UploadSongImageError = SongImageValidationError | "UPLOAD_FAILED";

export type UploadSongImageResult =
  | { ok: true; key: string }
  | { ok: false; error: UploadSongImageError };

/**
 * Server-only upload primitive for a single song cover image (promoted out
 * of the ST3 HTTP endpoint into an internal helper — see ST4 report §31-32).
 * Callers are responsible for authentication/admin authorization *before*
 * calling this; it does not check either itself, and it does not touch the
 * database. It only:
 *   1. validates the file's size and actual binary format (never trusting
 *      the browser-declared Content-Type alone — see ./validate.ts),
 *   2. generates a fresh random UUID key with the canonical extension for
 *      the detected format,
 *   3. uploads it to `song-images` with `upsert: false`, using whichever
 *      Supabase client the caller passes in — which must be a user-scoped
 *      client (see lib/supabase/server.ts) so Storage RLS
 *      (song_images_admin_insert) is actually evaluated for this request.
 *      Never pass a service_role client here.
 *
 * On success the object exists in Storage but is not yet referenced by any
 * `songs` row — callers own attaching it (create_song/update_song) and
 * compensating (best-effort delete) if that DB step fails.
 */
export async function uploadSongImage(
  supabase: SupabaseClient,
  file: Blob
): Promise<UploadSongImageResult> {
  const declaredMime = typeof (file as { type?: unknown }).type === "string" ? (file as File).type : "";

  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await file.arrayBuffer());
  } catch {
    return { ok: false, error: "EMPTY_FILE" };
  }

  const validation = validateSongImage(bytes, declaredMime);
  if (!validation.ok) {
    return { ok: false, error: validation.error };
  }

  const key = `${randomUUID()}.${validation.extension}`;

  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(key, bytes, {
    contentType: validation.mime,
    cacheControl: STORAGE_CACHE_CONTROL,
    upsert: false,
  });

  if (uploadError) {
    // Never forward Storage's raw error text to callers (it can reveal RLS internals).
    console.error("uploadSongImage: Storage upload failed", uploadError.message);
    return { ok: false, error: "UPLOAD_FAILED" };
  }

  return { ok: true, key };
}
