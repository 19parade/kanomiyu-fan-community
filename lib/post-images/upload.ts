"use client";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * LIVE機能 Phase 4-B: client-side direct-to-Storage upload for fan photo
 * posts.
 *
 * Unlike lib/song-images/upload.ts / lib/event-images/upload.ts (which
 * upload from a server Route Handler, so a Vercel serverless function's
 * request-body size ceiling applies to the *whole* multipart payload), this
 * uploads straight from the browser to Supabase Storage — chosen
 * specifically so 4 photos of up to 5MiB each never have to pass through
 * this app's own server at all (see Phase 4-B design review for the full
 * reasoning). The tradeoff (accepted, documented): there is no server-side
 * magic-byte content check for these uploads — Storage's own bucket MIME
 * allowlist and the `internal.is_valid_post_image_key()` key-format RLS
 * check (supabase/migrations/20261026000001_post_images_storage.sql) are
 * the real, server-side authorization boundary, not this function.
 *
 * The extension is derived from the blob's declared MIME type (already
 * normalized by lib/post-images/reencode.ts to one of the 3 supported
 * types), using the browser's native `crypto.randomUUID()` for the key —
 * never overwriting an existing key (`upsert: false`), matching the
 * existing song-images/event-images convention so a later "replace" is
 * always a new key, never a cache-stale overwrite.
 */

const BUCKET = "post-images";

const MIME_TO_EXTENSION: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export type UploadPostImageResult = { ok: true; key: string } | { ok: false; error: string };

export async function uploadPostImage(
  supabase: SupabaseClient,
  blob: Blob,
  mime: string
): Promise<UploadPostImageResult> {
  const extension = MIME_TO_EXTENSION[mime];
  if (!extension) {
    return { ok: false, error: "UNSUPPORTED_IMAGE_TYPE" };
  }

  const key = `${crypto.randomUUID()}.${extension}`;

  const { error } = await supabase.storage.from(BUCKET).upload(key, blob, {
    contentType: mime,
    upsert: false,
  });

  if (error) {
    console.error("uploadPostImage: Storage upload failed", error.message);
    // Storage surfaces the rate-limit trigger and size-limit rejection as a
    // generic error here — the message text is inspected only for the
    // rate-limit case (the one callers need to distinguish for a clearer
    // user-facing message); everything else maps to a single generic code.
    if (error.message.includes("POST_IMAGE_UPLOAD_RATE_LIMITED")) {
      return { ok: false, error: "POST_IMAGE_UPLOAD_RATE_LIMITED" };
    }
    if (error.message.toLowerCase().includes("exceeded the maximum allowed size")) {
      return { ok: false, error: "FILE_TOO_LARGE" };
    }
    return { ok: false, error: "UPLOAD_FAILED" };
  }

  return { ok: true, key };
}
