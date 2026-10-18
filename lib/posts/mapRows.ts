import { excerptContent } from "./format";
import type { PublicComment, PublicPostAuthor, PublicPostListItem } from "./types";

/**
 * F5-D1 / F5-D1b: shared SELECT column list for the feed list query (used
 * by both app/feed/page.tsx's initial server-rendered page and
 * app/api/feed/route.ts's "load more" pagination), so the two never drift
 * apart. `likes(count)` / `comments(count)` are PostgREST embedded
 * aggregate counts, resolved under the related table's own RLS (see
 * supabase/migrations/20260926210000_likes_rls.sql /
 * 20260926120000_comments_rls.sql).
 *
 * F5-D1b §5 finding: for a *regular* fan-facing viewer (anon, or an
 * authenticated non-admin viewing someone else's post), the aggregate
 * already comes out correct, because the only policy such a caller can use
 * is comments_select_visible_authenticated / _public_anon, both of which
 * require status = 'published'. But empirically verified against the
 * verification project: an **active admin** viewing *any* post's
 * comments(count) additionally qualifies under comments_select_admin
 * (`USING (is_admin())`, no status condition at all), and PostgREST ORs
 * every applicable policy together for the aggregate — so an admin's count
 * included a hidden comment (2 instead of the correct 1 in the controlled
 * test). The post's own author hits the same problem via
 * comments_select_own (also status-unconditional) for their own hidden
 * comments. Closing this requires an explicit
 * `.eq("comments.status", "published")` embedded-resource filter on top of
 * RLS (PostgREST's dotted-path filter syntax for a selected relation,
 * confirmed empirically against the verification project), so the embedded
 * count is correct for every caller regardless of which policy they'd
 * otherwise qualify under. `likes` has no `status` column at all (F4/F5
 * schema — see supabase/migrations/20260920022832_core_schema.sql) and no
 * admin-unconditional SELECT policy either, so it needs no equivalent
 * filter.
 *
 * Every query that uses FEED_LIST_SELECT_COLUMNS (or
 * app/feed/[id]/page.tsx's own equivalent post-detail select) must also
 * chain `.eq("comments.status", "published")` — not expressed as a shared
 * helper here because supabase-js's per-table query-builder generics don't
 * give a clean type to wrap a single `.eq()` passthrough in, and each call
 * site is a one-line chain anyway.
 */
export const FEED_LIST_SELECT_COLUMNS =
  "id, author_id, post_type, content, created_at, likes(count), comments(count)";

const EXCERPT_LENGTH = 140;

export type PostListRow = {
  id: string;
  author_id: string;
  post_type: string;
  content: string;
  created_at: string;
  likes: { count: number }[] | null;
  comments: { count: number }[] | null;
};

function toPostType(value: string): PublicPostListItem["post_type"] {
  return value === "live_report" ? "live_report" : "normal";
}

/**
 * Maps one raw posts row (plus the already-fetched author batch) into the
 * public list-item shape. Never includes the full `content` — only a
 * truncated excerpt — so the list API response stays small and never
 * over-exposes a long post body before the reader opens it.
 */
export function mapPostListRow(
  row: PostListRow,
  authorMap: Map<string, PublicPostAuthor>
): PublicPostListItem {
  return {
    id: row.id,
    author_id: row.author_id,
    post_type: toPostType(row.post_type),
    excerpt: excerptContent(row.content, EXCERPT_LENGTH),
    created_at: row.created_at,
    like_count: row.likes?.[0]?.count ?? 0,
    comment_count: row.comments?.[0]?.count ?? 0,
    author: authorMap.get(row.author_id) ?? null,
  };
}

/**
 * F5-D1b §4: shared SELECT column list for the comment list query (used by
 * both app/feed/[id]/page.tsx's initial server-rendered first page and
 * app/api/feed/[id]/comments/route.ts's "load more" pagination).
 */
export const COMMENT_LIST_SELECT_COLUMNS = "id, author_id, content, created_at";

export type CommentListRow = {
  id: string;
  author_id: string;
  content: string;
  created_at: string;
};

export function mapCommentListRow(
  row: CommentListRow,
  authorMap: Map<string, PublicPostAuthor>
): PublicComment {
  return {
    id: row.id,
    author_id: row.author_id,
    content: row.content,
    created_at: row.created_at,
    author: authorMap.get(row.author_id) ?? null,
  };
}
