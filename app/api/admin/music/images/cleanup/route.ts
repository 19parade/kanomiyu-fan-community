import { NextResponse } from "next/server";

import { requireActiveAdmin } from "@/lib/admin/authorize";
import { isSameOriginRequest } from "@/lib/http/verify-same-origin";
import { runSongImageCleanup, SongImageScanError } from "@/lib/song-images/cleanup";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// Touches cookies and Supabase — Node.js runtime required (Edge is
// deprecated in this Next.js version).
export const runtime = "nodejs";

function errorResponse(code: string, status: number) {
  return NextResponse.json({ error: code }, { status, headers: { "Cache-Control": "no-store" } });
}

/**
 * POST /api/admin/music/images/cleanup
 *
 * Manual, admin-triggered cleanup of `song-images` Storage objects that are
 * both (a) currently unreferenced by any song and (b) at least 24h old
 * (see lib/song-images/cleanup.ts for the full contract and rationale).
 *
 * This is NOT a generic "delete this key" endpoint (see ST5 report §10):
 * the request body is not read at all, and the caller has no way to name
 * which object gets deleted. The server alone discovers and decides
 * candidates; the only choice the caller has is whether to run this
 * operation at all.
 *
 * No GET handler is exported — GET (and every other undefined method) is
 * unsupported for a route that only performs deletions, and Next.js
 * responds 405 automatically for methods a Route Handler does not export.
 *
 * Order: Origin check -> authentication -> active-admin authorization ->
 * cleanup. Reuses lib/http/verify-same-origin.ts and lib/admin/authorize.ts
 * unchanged from ST4.
 */
export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return errorResponse("ORIGIN_INVALID", 403);
  }

  let supabase;
  try {
    supabase = await createSupabaseServerClient();
  } catch (error) {
    console.error("song image cleanup: failed to create Supabase client", error);
    return errorResponse("CLEANUP_FAILED", 500);
  }

  const authResult = await requireActiveAdmin(supabase);
  if (!authResult.authorized) {
    return authResult.reason === "UNAUTHENTICATED"
      ? errorResponse("UNAUTHORIZED", 401)
      : errorResponse("FORBIDDEN", 403);
  }

  // Fixed once per request; the 24h cutoff never moves while this request
  // is scanning, regardless of how long the scan/delete loop takes.
  const cleanupStartedAt = new Date();

  try {
    const summary = await runSongImageCleanup(supabase, cleanupStartedAt);
    return NextResponse.json(summary, { status: 200, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof SongImageScanError) {
      // Candidate discovery could not even begin (the first Storage list()
      // call itself failed) — this is an upstream failure, not a partial
      // cleanup result.
      console.error("song image cleanup: initial Storage list failed", error.message);
      return errorResponse("CLEANUP_SCAN_FAILED", 502);
    }
    console.error("song image cleanup: unexpected failure", error);
    return errorResponse("CLEANUP_FAILED", 500);
  }
}
