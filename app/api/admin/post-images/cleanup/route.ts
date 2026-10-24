import { NextResponse } from "next/server";

import { requireActiveAdmin } from "@/lib/admin/authorize";
import { isSameOriginRequest } from "@/lib/http/verify-same-origin";
import { PostImageScanError, runPostImageCleanup } from "@/lib/post-images/cleanup";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function errorResponse(code: string, status: number) {
  return NextResponse.json({ error: code }, { status, headers: { "Cache-Control": "no-store" } });
}

/**
 * POST /api/admin/post-images/cleanup
 *
 * LIVE機能 Phase 4-B: manual, admin-triggered cleanup of `post-images`
 * Storage objects that are both (a) not referenced by any `post_images`
 * row and (b) at least 24h old (see lib/post-images/cleanup.ts for the
 * full contract — the grace period and the explicit post_images reference
 * check, which this bucket's own DELETE policy does not provide, unlike
 * song-images/event-images).
 *
 * Mirrors app/api/admin/music/images/cleanup/route.ts's shape exactly: the
 * request body is not read at all, and the caller has no way to name which
 * object gets deleted — the server alone discovers and decides candidates.
 */
export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return errorResponse("ORIGIN_INVALID", 403);
  }

  let supabase;
  try {
    supabase = await createSupabaseServerClient();
  } catch (error) {
    console.error("post image cleanup: failed to create Supabase client", error);
    return errorResponse("CLEANUP_FAILED", 500);
  }

  const authResult = await requireActiveAdmin(supabase);
  if (!authResult.authorized) {
    return authResult.reason === "UNAUTHENTICATED"
      ? errorResponse("UNAUTHORIZED", 401)
      : errorResponse("FORBIDDEN", 403);
  }

  const cleanupStartedAt = new Date();

  try {
    const summary = await runPostImageCleanup(supabase, cleanupStartedAt);
    return NextResponse.json(summary, { status: 200, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof PostImageScanError) {
      console.error("post image cleanup: initial Storage list failed", error.message);
      return errorResponse("CLEANUP_SCAN_FAILED", 502);
    }
    console.error("post image cleanup: unexpected failure", error);
    return errorResponse("CLEANUP_FAILED", 500);
  }
}
