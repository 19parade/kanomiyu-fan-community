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
  | "LIST_FAILED"
  | string; // widened for pass-through DB error codes (see mapNewsDbError)

function errorResponse(code: ErrorCode, status: number) {
  return NextResponse.json({ error: code }, { status, headers: { "Cache-Control": "no-store" } });
}

const UUID_SHAPE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const LIST_PAGE_SIZE = 50; // server-fixed, not client-configurable (mirrors events/music admin lists).

/**
 * GET /api/admin/news
 *
 * Read-only admin news list. Thin HTTP wrapper around get_admin_news() (see
 * supabase/migrations/20261108030000_news_admin_list.sql), which remains the
 * sole authority for status-filter validation, keyset cursor semantics, and
 * ordering. `page_size` is fixed server-side; `has_more` is computed here
 * (rows returned === LIST_PAGE_SIZE) since the RPC returns no total count.
 */
export async function GET(request: Request) {
  let supabase;
  try {
    supabase = await createSupabaseServerClient();
  } catch (error) {
    console.error("list news: failed to create Supabase client", error);
    return errorResponse("LIST_FAILED", 500);
  }

  const authResult = await requireActiveAdmin(supabase);
  if (!authResult.authorized) {
    return authResult.reason === "UNAUTHENTICATED"
      ? errorResponse("UNAUTHORIZED", 401)
      : errorResponse("FORBIDDEN", 403);
  }

  const url = new URL(request.url);
  const status = url.searchParams.get("status");
  const afterPublishedAt = url.searchParams.get("after_published_at");
  const afterId = url.searchParams.get("after_id");

  if (status !== null && status !== "draft" && status !== "published") {
    return errorResponse("INVALID_NEWS_STATUS_FILTER", 400);
  }

  if (afterId !== null && !UUID_SHAPE.test(afterId)) {
    return errorResponse("INVALID_NEWS_CURSOR", 400);
  }

  const { data, error } = await supabase.rpc("get_admin_news", {
    status_filter: status,
    page_size: LIST_PAGE_SIZE,
    after_published_at: afterPublishedAt,
    after_id: afterId,
  });

  if (error) {
    const mapped = mapNewsDbError(error.message);
    return errorResponse(mapped.code, mapped.status);
  }

  const news = data ?? [];

  return NextResponse.json(
    { news, has_more: news.length === LIST_PAGE_SIZE },
    { status: 200, headers: { "Cache-Control": "no-store" } }
  );
}

/**
 * POST /api/admin/news
 *
 * Thin HTTP wrapper around create_news() (see supabase/migrations/
 * 20261108050000_news_admin_create.sql). JSON body. Unlike create_event /
 * create_song, this does not always create a draft — `is_published` is
 * forwarded as-is, matching the admin form's single-screen "公開状態" field
 * (see that migration's doc comment for why news deviates from the
 * events/songs two-step publish convention).
 */
export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return errorResponse("ORIGIN_INVALID", 403);
  }

  let supabase;
  try {
    supabase = await createSupabaseServerClient();
  } catch (error) {
    console.error("create news: failed to create Supabase client", error);
    return errorResponse("NEWS_OPERATION_FAILED", 500);
  }

  const authResult = await requireActiveAdmin(supabase);
  if (!authResult.authorized) {
    return authResult.reason === "UNAUTHENTICATED"
      ? errorResponse("UNAUTHORIZED", 401)
      : errorResponse("FORBIDDEN", 403);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch (error) {
    console.error("create news: could not parse JSON body", error);
    return errorResponse("INVALID_REQUEST", 400);
  }

  if (typeof body !== "object" || body === null) {
    return errorResponse("INVALID_REQUEST", 400);
  }
  const b = body as Record<string, unknown>;

  const title = b.title;
  const publishedAt = b.published_at;
  if (typeof title !== "string" || typeof publishedAt !== "string") {
    return errorResponse("INVALID_REQUEST", 400);
  }
  if (typeof b.is_published !== "boolean") {
    return errorResponse("INVALID_REQUEST", 400);
  }

  const asNullableString = (value: unknown): string | null =>
    typeof value === "string" && value.length > 0 ? value : null;

  const { data: newsId, error: createError } = await supabase.rpc("create_news", {
    title,
    published_at: publishedAt,
    content: asNullableString(b.content),
    source_url: asNullableString(b.source_url),
    is_published: b.is_published,
  });

  if (createError) {
    const mapped = mapNewsDbError(createError.message);
    return errorResponse(mapped.code, mapped.status);
  }

  return NextResponse.json({ id: newsId }, { status: 201, headers: { "Cache-Control": "no-store" } });
}
