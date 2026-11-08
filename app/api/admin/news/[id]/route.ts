import { NextResponse } from "next/server";

import { requireActiveAdmin } from "@/lib/admin/authorize";
import { isSameOriginRequest } from "@/lib/http/verify-same-origin";
import { mapNewsDbError } from "@/lib/news/errors";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type ErrorCode =
  | "ORIGIN_INVALID"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "INVALID_REQUEST"
  | "NEWS_NOT_FOUND"
  | string; // widened for pass-through DB error codes (see mapNewsDbError)

function errorResponse(code: ErrorCode, status: number) {
  return NextResponse.json({ error: code }, { status, headers: { "Cache-Control": "no-store" } });
}

const UUID_SHAPE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/**
 * PATCH /api/admin/news/[id]
 *
 * Thin HTTP wrapper around update_news() (see supabase/migrations/
 * 20261108060000_news_admin_update.sql). JSON body (no file upload — this
 * feature has no image field). `expected_updated_at` is read and forwarded
 * as the raw request string, never JS-Date-converted — update_news's own
 * equality check against the current `updated_at` remains the sole
 * concurrency arbiter.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSameOriginRequest(request)) {
    return errorResponse("ORIGIN_INVALID", 403);
  }

  let supabase;
  try {
    supabase = await createSupabaseServerClient();
  } catch (error) {
    console.error("update news: failed to create Supabase client", error);
    return errorResponse("NEWS_OPERATION_FAILED", 500);
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
    console.error("update news: could not parse JSON body", error);
    return errorResponse("INVALID_REQUEST", 400);
  }

  if (typeof body !== "object" || body === null) {
    return errorResponse("INVALID_REQUEST", 400);
  }
  const b = body as Record<string, unknown>;

  const expectedUpdatedAt = b.expected_updated_at;
  const title = b.title;
  const publishedAt = b.published_at;
  if (
    typeof expectedUpdatedAt !== "string" ||
    typeof title !== "string" ||
    typeof publishedAt !== "string"
  ) {
    return errorResponse("INVALID_REQUEST", 400);
  }
  if (typeof b.is_published !== "boolean") {
    return errorResponse("INVALID_REQUEST", 400);
  }

  const asNullableString = (value: unknown): string | null =>
    typeof value === "string" && value.length > 0 ? value : null;

  const { error: updateError } = await supabase.rpc("update_news", {
    target_news_id: id,
    expected_updated_at: expectedUpdatedAt,
    title,
    published_at: publishedAt,
    content: asNullableString(b.content),
    source_url: asNullableString(b.source_url),
    is_published: b.is_published,
  });

  if (updateError) {
    const mapped = mapNewsDbError(updateError.message);
    return errorResponse(mapped.code, mapped.status);
  }

  // Re-fetch to return the definitive current updated_at (the version token
  // the caller needs for its next PATCH) — mirrors the events/music admin
  // routes' same re-fetch-after-mutation pattern.
  const { data: afterRows, error: afterError } = await supabase.rpc("get_admin_news_item", {
    target_news_id: id,
  });

  if (afterError || !Array.isArray(afterRows) || !afterRows[0]) {
    console.error("update news: post-update re-fetch failed", afterError?.message);
    return errorResponse("NEWS_OPERATION_FAILED", 500);
  }

  return NextResponse.json(
    { updated_at: afterRows[0].updated_at },
    { status: 200, headers: { "Cache-Control": "no-store" } }
  );
}

/**
 * DELETE /api/admin/news/[id]
 *
 * Thin HTTP wrapper around delete_news() (see supabase/migrations/
 * 20261108070000_news_admin_delete.sql). The confirmation step itself is a
 * client-side window.confirm() in components/admin/news/NewsAdminList.tsx /
 * EditNewsForm.tsx (same pattern as EditEventForm.tsx's status-change
 * confirmations) — this route performs the delete unconditionally once
 * called.
 */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSameOriginRequest(request)) {
    return errorResponse("ORIGIN_INVALID", 403);
  }

  let supabase;
  try {
    supabase = await createSupabaseServerClient();
  } catch (error) {
    console.error("delete news: failed to create Supabase client", error);
    return errorResponse("NEWS_OPERATION_FAILED", 500);
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

  const { error: deleteError } = await supabase.rpc("delete_news", { target_news_id: id });

  if (deleteError) {
    const mapped = mapNewsDbError(deleteError.message);
    return errorResponse(mapped.code, mapped.status);
  }

  return NextResponse.json({ ok: true }, { status: 200, headers: { "Cache-Control": "no-store" } });
}
