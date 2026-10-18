import { NextResponse } from "next/server";

import { fetchAuthorsByIds } from "@/lib/posts/authors";
import { COMMENT_LIST_SELECT_COLUMNS, mapCommentListRow, type CommentListRow } from "@/lib/posts/mapRows";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// Touches cookies and Supabase — Node.js runtime required, matching
// app/api/feed/route.ts / app/api/fans/route.ts.
export const runtime = "nodejs";

type ErrorCode = "INVALID_POST_ID" | "INVALID_CURSOR" | "LIST_FAILED" | string;

function errorResponse(code: ErrorCode, status: number) {
  return NextResponse.json({ error: code }, { status, headers: { "Cache-Control": "no-store" } });
}

const UUID_SHAPE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
// Same strict shape as app/api/feed/route.ts, for the same reason (rules
// out filter-syntax injection via a crafted `after_created_at`).
const ISO_TIMESTAMP_SHAPE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

const PAGE_SIZE = 20;

/**
 * GET /api/feed/[id]/comments
 *
 * "Load more" pagination for a single post's comments (F5-D1b §4) — the
 * first page is fetched directly by app/feed/[id]/page.tsx itself
 * (mirroring /feed and /api/feed's own split), this route only serves
 * subsequent pages.
 *
 * Deliberately does not re-verify the parent post's own visibility: a
 * comments SELECT against a post the caller cannot see (hidden/deleted,
 * nonexistent, or bidirectionally blocked) already returns zero rows under
 * comments_select_visible_authenticated / _public_anon's own parent-post
 * join (see supabase/migrations/20260926120000_comments_rls.sql) —
 * re-checking here would only duplicate that RLS logic, not add a security
 * boundary. `status = 'published'` is still explicit on the comments query
 * itself, for the same admin/self-broader-policy reason
 * app/api/feed/route.ts documents.
 *
 * created_at ASC (oldest first, matching the initial page's display order)
 * with `id` as the tie-break — ascending keyset pagination therefore uses
 * `gt`, the mirror image of /api/feed's descending `lt`.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: postId } = await params;

  if (!UUID_SHAPE.test(postId)) {
    return errorResponse("INVALID_POST_ID", 400);
  }

  let supabase;
  try {
    supabase = await createSupabaseServerClient();
  } catch (error) {
    console.error("comment list: failed to create Supabase client", error);
    return errorResponse("LIST_FAILED", 500);
  }

  const url = new URL(request.url);
  const afterCreatedAt = url.searchParams.get("after_created_at");
  const afterId = url.searchParams.get("after_id");

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
    .from("comments")
    .select(COMMENT_LIST_SELECT_COLUMNS)
    .eq("post_id", postId)
    .eq("status", "published")
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(PAGE_SIZE);

  if (afterCreatedAt !== null && afterId !== null) {
    // Ascending keyset pagination: strictly "greater than" the cursor
    // tuple (mirror of /api/feed's descending `lt` — see that route's doc
    // comment for why the `and(...)` tie-break term is required).
    query = query.or(`created_at.gt.${afterCreatedAt},and(created_at.eq.${afterCreatedAt},id.gt.${afterId})`);
  }

  const { data, error } = await query;

  if (error) {
    console.error("comment list: comments query failed", error.message);
    return errorResponse("LIST_FAILED", 500);
  }

  const rows = (data ?? []) as unknown as CommentListRow[];

  // Each page is capped at PAGE_SIZE (20) distinct comment authors at
  // most — well under get_public_profiles_by_ids()'s 50-id limit (F5-D1b
  // §4's explicit requirement).
  const authorLookup = await fetchAuthorsByIds(
    supabase,
    rows.map((row) => row.author_id)
  );

  if (!authorLookup.ok) {
    return errorResponse("LIST_FAILED", 500);
  }

  const comments = rows.map((row) => mapCommentListRow(row, authorLookup.authors));

  return NextResponse.json(
    { comments, has_more: rows.length === PAGE_SIZE },
    { status: 200, headers: { "Cache-Control": "no-store" } }
  );
}
