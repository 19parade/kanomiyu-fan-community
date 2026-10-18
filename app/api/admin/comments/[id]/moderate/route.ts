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
 * PATCH /api/admin/comments/[id]/moderate
 *
 * F5-D4c: thin HTTP wrapper around the existing public.moderate_comment()
 * RPC (supabase/migrations/20260926180000_moderation_rpcs.sql), reused
 * unchanged. Same design as PATCH /api/admin/posts/[id]/moderate — see
 * that route's doc comment for the shared reasoning (transition rules
 * left entirely to the RPC, distinct from report processing).
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSameOriginRequest(request)) {
    return errorResponse("ORIGIN_INVALID", 403);
  }

  let supabase;
  try {
    supabase = await createSupabaseServerClient();
  } catch (error) {
    console.error("moderate comment: failed to create Supabase client", error);
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
    console.error("moderate comment: could not parse JSON body", error);
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

  const { error: moderateError } = await supabase.rpc("moderate_comment", {
    target_comment_id: id,
    new_status: newStatusValue,
    reason,
  });

  if (moderateError) {
    const mapped = mapModerationDbError(moderateError.message);
    return errorResponse(mapped.code, mapped.status);
  }

  const { data: afterRow, error: afterError } = await supabase
    .from("comments")
    .select("id, status")
    .eq("id", id)
    .maybeSingle();

  if (afterError || !afterRow) {
    console.error("moderate comment: post-update re-fetch failed", afterError?.message);
    return errorResponse("MODERATION_FAILED", 500);
  }

  return NextResponse.json({ comment: afterRow }, { status: 200, headers: { "Cache-Control": "no-store" } });
}
