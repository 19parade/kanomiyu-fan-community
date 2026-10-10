import { NextResponse } from "next/server";

import { getSongImagePublicUrl } from "@/lib/song-images/public-url";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// Touches cookies and Supabase — Node.js runtime required (Edge is
// deprecated in this Next.js version), matching the admin routes.
export const runtime = "nodejs";

type ErrorCode = "INVALID_CURSOR" | "LIST_FAILED" | string;

function errorResponse(code: ErrorCode, status: number) {
  return NextResponse.json({ error: code }, { status, headers: { "Cache-Control": "no-store" } });
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const UUID_SHAPE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

// The exact 4 columns get_public_songs() returns (S2) — never widened.
type PublicSongRpcRow = {
  id: string;
  title: string;
  release_date: string | null;
  cover_image_url: string | null;
};

// Server-fixed; not client-configurable (mirrors A2's GET /api/admin/music).
const PAGE_SIZE = 20;

/**
 * GET /api/music
 *
 * Public, anonymous-accessible pagination endpoint for "load more" on
 * /music (P1). Thin wrapper around the existing get_public_songs() RPC
 * (S2 — see supabase/migrations/20260928070000_songs_public_list.sql),
 * which is not modified and remains the sole authority for the
 * status='public' filter, keyset cursor semantics, and ordering.
 *
 * No admin authorization check and no same-origin check: this route calls
 * no admin-only RPC, performs no mutation, and is meant to be reachable by
 * anonymous visitors exactly like the page itself (mirrors GET
 * /api/admin/music's own "read-only, no Origin check" precedent, minus the
 * admin-auth requirement since this endpoint is intentionally public).
 * createSupabaseServerClient() degrades to an anonymous-role client when no
 * session cookie is present — never service_role.
 *
 * Query parameters are only pre-validated here for *shape* (UUID / ISO
 * date), so a malformed value never surfaces as a raw Postgres type-cast
 * error — the RPC's own INVALID_SONG_CURSOR remains the authority for the
 * "after_release_date without after_id" case.
 *
 * Each row's cover_image_url (a Storage object key, never a URL) is
 * resolved server-side into a display URL via getSongImagePublicUrl()
 * before the response is serialized — the raw key is never sent to the
 * browser from this route.
 */
export async function GET(request: Request) {
  let supabase;
  try {
    supabase = await createSupabaseServerClient();
  } catch (error) {
    console.error("public music list: failed to create Supabase client", error);
    return errorResponse("LIST_FAILED", 500);
  }

  const url = new URL(request.url);
  const afterReleaseDate = url.searchParams.get("after_release_date");
  const afterId = url.searchParams.get("after_id");

  if (afterId !== null && !UUID_SHAPE.test(afterId)) {
    return errorResponse("INVALID_CURSOR", 400);
  }

  if (afterReleaseDate !== null && !ISO_DATE.test(afterReleaseDate)) {
    return errorResponse("INVALID_CURSOR", 400);
  }

  const { data, error } = await supabase.rpc("get_public_songs", {
    after_release_date: afterReleaseDate,
    after_id: afterId,
    page_size: PAGE_SIZE,
  });

  if (error) {
    // get_public_songs' only documented error is INVALID_SONG_CURSOR (the
    // "after_release_date without after_id" case) — never surface the raw
    // DB error message to the client.
    const code = error.message === "INVALID_SONG_CURSOR" ? "INVALID_CURSOR" : "LIST_FAILED";
    const status = error.message === "INVALID_SONG_CURSOR" ? 400 : 500;
    return errorResponse(code, status);
  }

  const rows = (data ?? []) as PublicSongRpcRow[];
  const songs = rows.map((row) => ({
    id: row.id,
    title: row.title,
    release_date: row.release_date,
    cover_image_url: getSongImagePublicUrl(supabase, row.cover_image_url),
  }));

  return NextResponse.json(
    { songs, has_more: rows.length === PAGE_SIZE },
    { status: 200, headers: { "Cache-Control": "no-store" } }
  );
}
