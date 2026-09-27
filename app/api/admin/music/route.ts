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
  | "INVALID_UPLOAD"
  | "FILE_TOO_LARGE"
  | "UNSUPPORTED_IMAGE_TYPE"
  | "IMAGE_TYPE_MISMATCH"
  | "UPLOAD_FAILED"
  | string; // widened for pass-through DB error codes (see mapSongDbError)

function errorResponse(code: ErrorCode, status: number) {
  return NextResponse.json({ error: code }, { status, headers: { "Cache-Control": "no-store" } });
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * POST /api/admin/music
 *
 * Business operation "create song with optional cover" (ST4). Combines the
 * ST3 upload primitive (now lib/song-images/upload.ts) with the existing
 * create_song RPC (S5), which is reused unchanged.
 *
 * Non-atomic sequencing (Storage and Postgres are two separate systems —
 * see the ST4 report for the full rationale):
 *   1. If a file is present, upload it first (Storage).
 *   2. Call create_song with the resulting key (or null if no file).
 *   3. If create_song fails, best-effort delete the just-uploaded key
 *      (compensation) — the object was never attached to any song, so no
 *      other reference can exist yet.
 *
 * Does not call set_song_status; every created song starts as 'draft' by
 * create_song's own contract. Does not resolve a public URL.
 */
export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return errorResponse("ORIGIN_INVALID", 403);
  }

  let supabase;
  try {
    supabase = await createSupabaseServerClient();
  } catch (error) {
    console.error("create song: failed to create Supabase client", error);
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
    console.error("create song: could not parse multipart body", error);
    return errorResponse("INVALID_REQUEST", 400);
  }

  const titleEntry = formData.get("title");
  if (typeof titleEntry !== "string") {
    return errorResponse("INVALID_REQUEST", 400);
  }
  const title = titleEntry;

  const releaseDateEntry = formData.get("release_date");
  let releaseDate: string | null = null;
  if (typeof releaseDateEntry === "string" && releaseDateEntry.length > 0) {
    if (!ISO_DATE.test(releaseDateEntry)) {
      // Reject malformed date strings here so a Postgres type-cast error
      // (22007) is never the caller-visible response.
      return errorResponse("INVALID_SONG_RELEASE_DATE", 400);
    }
    releaseDate = releaseDateEntry;
  }

  const descriptionEntry = formData.get("description");
  const description = typeof descriptionEntry === "string" ? descriptionEntry : null;

  const fileEntries = formData.getAll("file");
  if (fileEntries.length > 1) {
    return errorResponse("INVALID_REQUEST", 400);
  }
  const file = fileEntries.length === 1 ? fileEntries[0] : null;
  if (file !== null && !(file instanceof Blob)) {
    return errorResponse("INVALID_REQUEST", 400);
  }

  let coverImageKey: string | null = null;
  if (file instanceof Blob) {
    const uploadResult = await uploadSongImage(supabase, file);
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
    coverImageKey = uploadResult.key;
  }

  const { data: songId, error: createError } = await supabase.rpc("create_song", {
    title,
    release_date: releaseDate,
    cover_image_url: coverImageKey,
    description,
  });

  if (createError) {
    // Compensation: the upload (if any) succeeded but the DB mutation it was
    // meant to support did not. The object is unattached to any song, so it
    // cannot legitimately be "still referenced" — but the delete is still
    // only best-effort (see lib/song-images/delete.ts) and its outcome never
    // changes the error already being reported to the caller.
    if (coverImageKey !== null) {
      await deleteSongImageBestEffort(supabase, coverImageKey);
    }

    const mapped = mapSongDbError(createError.message);
    return errorResponse(mapped.code, mapped.status);
  }

  return NextResponse.json({ id: songId }, { status: 201, headers: { "Cache-Control": "no-store" } });
}
