import { NextResponse } from "next/server";

import { requireActiveAdmin } from "@/lib/admin/authorize";
import { mapModerationDbError } from "@/lib/admin/moderation/errors";
import { isSameOriginRequest } from "@/lib/http/verify-same-origin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type ErrorCode = "ORIGIN_INVALID" | "UNAUTHORIZED" | "FORBIDDEN" | "INVALID_REQUEST" | string;

function errorResponse(code: ErrorCode, status: number) {
  return NextResponse.json({ error: code }, { status, headers: { "Cache-Control": "no-store" } });
}

const UUID_SHAPE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const VALID_STATUSES = new Set(["published", "hidden"]);

/**
 * PATCH /api/admin/posts/[id]/moderate
 *
 * F5-D4c: thin HTTP wrapper around the existing public.moderate_post() RPC
 * (supabase/migrations/20260926180000_moderation_rpcs.sql), reused
 * unchanged. moderate_post() only ever accepts published<->hidden — it
 * rejects 'deleted' and any no-op with INVALID_MODERATION_TRANSITION
 * itself, so this route adds no transition rules of its own beyond
 * rejecting an obviously malformed request body (same division of
 * responsibility as PATCH /api/admin/reports/[id]).
 *
 * This is a deliberately distinct endpoint from PATCH
 * /api/admin/reports/[id] (process_report()) — moderating a post's
 * visibility and processing a report's status are separate operations per
 * PROJECT_SPEC.md's own "対象のmoderationとの分離" — this route never
 * touches reports, and the reports route never touches posts/comments.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSameOriginRequest(request)) {
    return errorResponse("ORIGIN_INVALID", 403);
  }

  let supabase;
  try {
    supabase = await createSupabaseServerClient();
  } catch (error) {
    console.error("moderate post: failed to create Supabase client", error);
    return errorResponse("MODERATION_FAILED", 500);
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

  let body: unknown;
  try {
    body = await request.json();
  } catch (error) {
    console.error("moderate post: could not parse JSON body", error);
    return errorResponse("INVALID_REQUEST", 400);
  }

  if (typeof body !== "object" || body === null) {
    return errorResponse("INVALID_REQUEST", 400);
  }

  const newStatusValue = (body as Record<string, unknown>).new_status;
  if (typeof newStatusValue !== "string" || !VALID_STATUSES.has(newStatusValue)) {
    return errorResponse("INVALID_MODERATION_TRANSITION", 400);
  }

  const reasonValue = (body as Record<string, unknown>).reason;
  const reason = typeof reasonValue === "string" && reasonValue.length > 0 ? reasonValue : null;

  const { error: moderateError } = await supabase.rpc("moderate_post", {
    target_post_id: id,
    new_status: newStatusValue,
    reason,
  });

  if (moderateError) {
    const mapped = mapModerationDbError(moderateError.message);
    return errorResponse(mapped.code, mapped.status);
  }

  const { data: afterRow, error: afterError } = await supabase
    .from("posts")
    .select("id, status")
    .eq("id", id)
    .maybeSingle();

  if (afterError || !afterRow) {
    console.error("moderate post: post-update re-fetch failed", afterError?.message);
    return errorResponse("MODERATION_FAILED", 500);
  }

  return NextResponse.json({ post: afterRow }, { status: 200, headers: { "Cache-Control": "no-store" } });
}
