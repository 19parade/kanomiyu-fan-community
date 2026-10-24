import { NextResponse } from "next/server";

import { deletePostImageBestEffort } from "@/lib/post-images/delete";
import { isSameOriginRequest } from "@/lib/http/verify-same-origin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function errorResponse(code: string, status: number) {
  return NextResponse.json({ error: code }, { status, headers: { "Cache-Control": "no-store" } });
}

const UUID_SHAPE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/**
 * POST /api/live-posts/[id]/delete
 *
 * LIVE機能 Phase 4-B: delete path for a LIVE掲示板 post that has photos
 * attached. A text-only post still deletes via the existing direct browser
 * call to delete_own_post() (components/feed/PostOwnerActions.tsx) —
 * this route exists only because photo cleanup needs a server-side step
 * after the DB delete.
 *
 * Processing order (PM requirement: "画像キー取得と権限確認の順序に注意
 * する" — never expose image keys before ownership is confirmed):
 *   1. require a logged-in caller (createSupabaseServerClient reads their
 *      session cookie; every call below runs as *that* user, never
 *      service_role).
 *   2. call delete_own_post() — this is itself the ownership check
 *      (author_id = auth.uid()). It is existence-oracle safe and succeeds
 *      silently on a 0-row match (not the caller's own post, or already
 *      deleted) — see that RPC's own doc comment
 *      (supabase/migrations/20260926090000_posts_rls.sql).
 *   3. re-fetch the post's own status and require status === 'deleted'
 *      before doing anything else — the same "don't trust silence"
 *      principle components/feed/PostOwnerActions.tsx already applies to
 *      the text-only path. If this isn't true, the caller didn't own the
 *      post (or it was already gone), so no image key is ever read or
 *      exposed.
 *   4. only now read this post's image_key list — `post_images_select_own`
 *      (supabase/migrations/20261026000000_post_images.sql) lets the
 *      author read their own post's images regardless of the post's
 *      status, so this works even though step 3 just set status='deleted'.
 *   5. best-effort delete each image from Storage (never fails this
 *      request — a partial failure here is picked up later by the admin
 *      orphan cleanup endpoint, app/api/admin/post-images/cleanup/route.ts).
 *
 * Admin moderation (moderate_post → hidden) never calls this route — only
 * the post's own author reaches this path, and hidden posts keep their
 * images (PM requirement: "管理者によるhidden化では画像を残す").
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSameOriginRequest(request)) {
    return errorResponse("ORIGIN_INVALID", 403);
  }

  const { id } = await params;
  if (!UUID_SHAPE.test(id)) {
    return errorResponse("INVALID_REQUEST", 400);
  }

  let supabase;
  try {
    supabase = await createSupabaseServerClient();
  } catch (error) {
    console.error("live post delete: failed to create Supabase client", error);
    return errorResponse("DELETE_FAILED", 500);
  }

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return errorResponse("UNAUTHORIZED", 401);
  }

  const { error: rpcError } = await supabase.rpc("delete_own_post", { target_post_id: id });
  if (rpcError) {
    console.error("live post delete: delete_own_post failed", rpcError.message);
    return errorResponse("DELETE_FAILED", 500);
  }

  const { data: verifyRow, error: verifyError } = await supabase
    .from("posts")
    .select("status")
    .eq("id", id)
    .maybeSingle<{ status: string }>();

  if (verifyError) {
    console.error("live post delete: post-delete verification failed", verifyError.message);
    return errorResponse("DELETE_VERIFICATION_FAILED", 500);
  }

  if (verifyRow?.status !== "deleted") {
    // Not the caller's own post (or already gone) — delete_own_post()'s
    // silent no-op. Never read or expose any image key in this case.
    return errorResponse("DELETE_NOT_AUTHORIZED", 403);
  }

  const { data: imageRows, error: imagesError } = await supabase
    .from("post_images")
    .select("image_key")
    .eq("post_id", id);

  if (imagesError) {
    // The post itself is already deleted successfully — a failure to even
    // read the image list is logged, but never turned into a failure
    // response for this request (the post deletion already succeeded).
    console.error("live post delete: post_images read failed", imagesError.message);
    return NextResponse.json({ deleted: true, imagesCleaned: 0 }, { status: 200, headers: { "Cache-Control": "no-store" } });
  }

  let imagesCleaned = 0;
  for (const row of imageRows ?? []) {
    const outcome = await deletePostImageBestEffort(supabase, row.image_key as string);
    if (outcome === "deleted") {
      imagesCleaned += 1;
    }
    // "uncollected" / "error" outcomes are logged inside
    // deletePostImageBestEffort() itself and never fail this response —
    // any leftover object is picked up later by the admin cleanup
    // endpoint (re-triable by design, PM requirement).
  }

  return NextResponse.json(
    { deleted: true, imagesCleaned },
    { status: 200, headers: { "Cache-Control": "no-store" } }
  );
}
