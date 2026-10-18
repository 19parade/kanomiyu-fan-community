import type { SupabaseClient } from "@supabase/supabase-js";

import { fetchAuthorsByIds } from "@/lib/posts/authors";

export type AdminReportTarget =
  | { content: string; status: string; post_id?: string; parent_post_status?: string }
  | null;

export type AdminReportItem = {
  id: string;
  target_type: string;
  target_id: string;
  reason: string;
  detail: string | null;
  status: string;
  handled_by: string | null;
  handled_by_display_name: string | null;
  handled_at: string | null;
  created_at: string;
  updated_at: string;
  target: AdminReportTarget;
};

export type AdminReportListResult =
  | { ok: true; reports: AdminReportItem[]; hasMore: boolean }
  | { ok: false };

const LIST_PAGE_SIZE = 20;

type ReportRow = {
  id: string;
  target_type: string;
  target_id: string;
  reason: string;
  detail: string | null;
  status: string;
  handled_by: string | null;
  handled_at: string | null;
  created_at: string;
  updated_at: string;
};
type PostRow = { id: string; author_id: string; content: string; status: string };
type CommentRow = { id: string; post_id: string; author_id: string; content: string; status: string };

/**
 * F5-D4b: shared admin report list query, used by both
 * app/admin/reports/page.tsx's initial server-rendered page and
 * app/api/admin/reports/route.ts's "load more"/filter requests, so the two
 * never drift apart (same reasoning as lib/posts/mapRows.ts's
 * FEED_LIST_SELECT_COLUMNS for the fan-facing feed).
 *
 * `reporter_id` is never selected — see app/api/admin/reports/route.ts's
 * doc comment for why. Target content is resolved via posts_select_admin /
 * comments_select_admin (no status filter, so hidden/deleted targets still
 * resolve) so a report never silently loses its target preview.
 */
export async function fetchAdminReports(
  supabase: SupabaseClient,
  options: {
    statusFilter: string | null;
    afterCreatedAt: string | null;
    afterId: string | null;
  }
): Promise<AdminReportListResult> {
  let query = supabase
    .from("reports")
    .select("id, target_type, target_id, reason, detail, status, handled_by, handled_at, created_at, updated_at")
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(LIST_PAGE_SIZE);

  if (options.statusFilter !== null) {
    query = query.eq("status", options.statusFilter);
  }
  if (options.afterCreatedAt !== null && options.afterId !== null) {
    query = query.or(
      `created_at.lt.${options.afterCreatedAt},and(created_at.eq.${options.afterCreatedAt},id.lt.${options.afterId})`
    );
  }

  const { data, error } = await query;
  if (error) {
    console.error("admin reports: list query failed", error.message);
    return { ok: false };
  }

  const reports = (data ?? []) as ReportRow[];

  const directPostIds = Array.from(
    new Set(reports.filter((r) => r.target_type === "post").map((r) => r.target_id))
  );
  const commentIds = Array.from(
    new Set(reports.filter((r) => r.target_type === "comment").map((r) => r.target_id))
  );
  const handledByIds = reports.map((r) => r.handled_by).filter((id): id is string => id !== null);

  const [commentsResult, handlerLookup] = await Promise.all([
    commentIds.length > 0
      ? supabase.from("comments").select("id, post_id, author_id, content, status").in("id", commentIds)
      : Promise.resolve({ data: [] as CommentRow[], error: null }),
    fetchAuthorsByIds(supabase, handledByIds),
  ]);

  if (commentsResult.error) {
    console.error("admin reports: comments lookup failed", commentsResult.error.message);
    return { ok: false };
  }
  if (!handlerLookup.ok) {
    console.error("admin reports: handler author lookup failed");
    return { ok: false };
  }

  const commentsById = new Map<string, CommentRow>(
    ((commentsResult.data ?? []) as CommentRow[]).map((c) => [c.id, c])
  );

  // F5-D4c: a comment's parent post status is also needed (so the UI never
  // offers a "確認する" link to a /feed/[id] page that would 404 for a
  // hidden/deleted parent, even if the comment itself were visible there) —
  // fold the parent post ids from the just-fetched comments into the same
  // posts batch lookup as directly-reported posts.
  const parentPostIdsFromComments = Array.from(
    new Set(((commentsResult.data ?? []) as CommentRow[]).map((c) => c.post_id))
  );
  const allPostIds = Array.from(new Set([...directPostIds, ...parentPostIdsFromComments]));

  const postsResult =
    allPostIds.length > 0
      ? await supabase.from("posts").select("id, author_id, content, status").in("id", allPostIds)
      : { data: [] as PostRow[], error: null };

  if (postsResult.error) {
    console.error("admin reports: posts lookup failed", postsResult.error.message);
    return { ok: false };
  }

  const postsById = new Map<string, PostRow>(((postsResult.data ?? []) as PostRow[]).map((p) => [p.id, p]));

  const items: AdminReportItem[] = reports.map((r) => {
    let target: AdminReportTarget = null;
    if (r.target_type === "post") {
      const p = postsById.get(r.target_id);
      target = p ? { content: p.content, status: p.status } : null;
    } else if (r.target_type === "comment") {
      const c = commentsById.get(r.target_id);
      if (c) {
        const parentPost = postsById.get(c.post_id);
        target = {
          content: c.content,
          status: c.status,
          post_id: c.post_id,
          parent_post_status: parentPost?.status,
        };
      }
    }

    const handler = r.handled_by ? handlerLookup.authors.get(r.handled_by) ?? null : null;

    return {
      id: r.id,
      target_type: r.target_type,
      target_id: r.target_id,
      reason: r.reason,
      detail: r.detail,
      status: r.status,
      handled_by: r.handled_by,
      handled_by_display_name: handler?.display_name ?? null,
      handled_at: r.handled_at,
      created_at: r.created_at,
      updated_at: r.updated_at,
      target,
    };
  });

  return { ok: true, reports: items, hasMore: reports.length === LIST_PAGE_SIZE };
}
