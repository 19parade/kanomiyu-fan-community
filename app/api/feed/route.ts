import { NextResponse } from "next/server";

import { fetchAuthorsByIds } from "@/lib/posts/authors";
import { fetchLinkPreviewsForContents } from "@/lib/posts/linkPreviews";
import { FEED_LIST_SELECT_COLUMNS, mapPostListRow, type PostListRow } from "@/lib/posts/mapRows";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// Touches cookies and Supabase — Node.js runtime required (Edge is
// deprecated in this Next.js version), matching app/api/fans/route.ts.
export const runtime = "nodejs";

type ErrorCode = "INVALID_CURSOR" | "LIST_FAILED" | string;

function errorResponse(code: ErrorCode, status: number) {
  return NextResponse.json({ error: code }, { status, headers: { "Cache-Control": "no-store" } });
}

const UUID_SHAPE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
// Strict ISO 8601 timestamp shape (matches what this route itself returns
// via posts.created_at) — rejecting anything else before it ever reaches a
// hand-built PostgREST `.or()` filter string rules out filter-syntax
// injection via a crafted `after_created_at` value (a comma or parenthesis
// could otherwise manipulate the OR clause's structure).
const ISO_TIMESTAMP_SHAPE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

// Server-fixed; not client-configurable (mirrors GET /api/fans / /api/music).
const PAGE_SIZE = 20;

/**
 * GET /api/feed
 *
 * "Load more" pagination for /feed (F5-D1). Thin wrapper around a direct
 * `posts` SELECT — unlike /api/fans (which must go through
 * get_public_profiles() because public.profiles has no cross-user SELECT
 * policy), posts' own RLS already implements fan-facing visibility
 * directly (posts_select_public_anon / posts_select_visible_authenticated
 * — see F5-B §2's audit of why a direct query is viable here), so this
 * route never calls a posts-specific RPC. Author info is resolved
 * separately via get_public_profiles_by_ids() (F5-C1 migration B) since
 * posts only stores author_id.
 *
 * createSupabaseServerClient() is cookie-bound: an authenticated visitor's
 * own session reaches the query as themselves (bidirectional block
 * filtering and community-browsing gating apply via RLS), while an
 * anonymous visitor degrades to the anon policy — never service_role.
 *
 * `status = 'published'` is always explicit here even though RLS already
 * enforces visibility, because an admin or the post's own author has
 * broader SELECT policies (posts_select_admin / posts_select_own) that
 * would otherwise leak their own hidden/deleted posts into this public
 * feed listing for themselves.
 *
 * Every response carries `Cache-Control: no-store`: results differ by
 * caller (block relationships), matching /api/fans.
 */
export async function GET(request: Request) {
  let supabase;
  try {
    supabase = await createSupabaseServerClient();
  } catch (error) {
    console.error("feed list: failed to create Supabase client", error);
    return errorResponse("LIST_FAILED", 500);
  }

  const url = new URL(request.url);
  const afterCreatedAt = url.searchParams.get("after_created_at");
  const afterId = url.searchParams.get("after_id");

  // Cursor is "both null" (first page — not actually used by this route in
  // practice, since app/feed/page.tsx fetches the first page itself, but
  // still validated the same way as /api/fans for consistency) or "both
  // present". One without the other is an ambiguous cursor.
  if ((afterCreatedAt === null) !== (afterId === null)) {
    return errorResponse("INVALID_CURSOR", 400);
  }
  if (afterId !== null && !UUID_SHAPE.test(afterId)) {
    return errorResponse("INVALID_CURSOR", 400);
  }
  if (afterCreatedAt !== null && !ISO_TIMESTAMP_SHAPE.test(afterCreatedAt)) {
    return errorResponse("INVALID_CURSOR", 400);
  }

  let query = supabase
    .from("posts")
    .select(FEED_LIST_SELECT_COLUMNS)
    .eq("status", "published")
    // LIVE機能 Phase 3: LIVE掲示板の投稿(post_type='live_report')は対象LIVEの
    // 掲示板(/live/[id])にのみ表示し、通常フィードには混在させない(PM方針)。
    // DB・RLSの変更ではなく、このアプリ層のクエリにのみ絞り込みを追加する。
    .eq("post_type", "normal")
    // F5-D1b §5: without this, an admin or the post's own author viewer
    // would see comments(count) include their own hidden/deleted comments
    // (comments_select_admin / comments_select_own have no status
    // condition) — confirmed empirically against the verification project.
    // See lib/posts/mapRows.ts's doc comment for the full finding.
    .eq("comments.status", "published")
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(PAGE_SIZE);

  if (afterCreatedAt !== null && afterId !== null) {
    // Keyset pagination on (created_at, id) DESC: strictly "less than" the
    // cursor tuple. The `and(...)` tie-break term is what prevents
    // duplicate/missing rows across pages when two posts share the exact
    // same created_at instant (same millisecond timestamptz) — ordering by
    // created_at alone would be ambiguous in that case.
    query = query.or(`created_at.lt.${afterCreatedAt},and(created_at.eq.${afterCreatedAt},id.lt.${afterId})`);
  }

  const { data, error } = await query;

  if (error) {
    console.error("feed list: posts query failed", error.message);
    return errorResponse("LIST_FAILED", 500);
  }

  const rows = (data ?? []) as unknown as PostListRow[];
  const authorLookup = await fetchAuthorsByIds(
    supabase,
    rows.map((row) => row.author_id)
  );

  // F5-D1b §3 case B: the author RPC itself failing is a real backend
  // failure, not "these members don't exist" — never silently render every
  // post with a fake "unavailable" author as if that were normal.
  if (!authorLookup.ok) {
    return errorResponse("LIST_FAILED", 500);
  }

  const linkPreviewMap = await fetchLinkPreviewsForContents(
    supabase,
    rows.map((row) => row.content)
  );

  const posts = rows.map((row) => mapPostListRow(row, authorLookup.authors, linkPreviewMap));

  return NextResponse.json(
    { posts, has_more: rows.length === PAGE_SIZE },
    { status: 200, headers: { "Cache-Control": "no-store" } }
  );
}
