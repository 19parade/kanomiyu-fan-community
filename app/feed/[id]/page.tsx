import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { CommentSection } from "@/components/feed/CommentSection";
import { LikeButton } from "@/components/feed/LikeButton";
import { LinkPreviewCard } from "@/components/feed/LinkPreviewCard";
import { PostContentText } from "@/components/feed/PostContentText";
import { PostOwnerActions } from "@/components/feed/PostOwnerActions";
import { ReportButton } from "@/components/feed/ReportButton";
import { PostImageGallery } from "@/components/live/PostImageGallery";
import { AvatarInitial } from "@/components/ui/AvatarInitial";
import { Card } from "@/components/ui/Card";
import { UNOFFICIAL_LABEL } from "@/lib/legal/site-info";
import { getMemberAccess } from "@/lib/member/access";
import { extractFirstUrl } from "@/lib/links/extract";
import { fetchAuthorsByIds } from "@/lib/posts/authors";
import { formatPostDate, UNAVAILABLE_AUTHOR_LABEL } from "@/lib/posts/format";
import { fetchLinkPreviewsByUrls } from "@/lib/posts/linkPreviews";
import { COMMENT_LIST_SELECT_COLUMNS, mapCommentListRow, type CommentListRow } from "@/lib/posts/mapRows";
import type { PublicComment, PublicPostAuthor, PublicPostDetail } from "@/lib/posts/types";
import { buildPageMetadata } from "@/lib/seo/metadata";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// Matches the actually-enforced posts.id / comments.post_id shape (uuid) —
// same pre-check pattern as app/music/[id]/page.tsx's UUID_SHAPE, so a
// malformed id never reaches a round-trip query at all.
const UUID_SHAPE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

const POST_TYPE_LABEL: Record<string, string> = {
  normal: "通常投稿",
  live_report: "LIVEレポート",
};

const INITIAL_COMMENT_PAGE_SIZE = 20;

type PostDetailRow = {
  id: string;
  author_id: string;
  post_type: string;
  event_id: string | null;
  content: string;
  created_at: string;
  likes: { count: number }[] | null;
  comments: { count: number }[] | null;
};

function toPostType(value: string): PublicPostDetail["post_type"] {
  return value === "live_report" ? "live_report" : "normal";
}

type PostDetailResult = {
  post: PublicPostDetail;
  comments: PublicComment[];
  commentsHasMore: boolean;
  authors: Map<string, PublicPostAuthor>;
};

/**
 * Fetches a single published post plus its first page of published
 * comments, both resolved through direct SELECTs (RLS is the visibility
 * authority — see app/api/feed/route.ts's doc comment). `status =
 * 'published'` is always explicit on both queries: even though RLS already
 * restricts anon/other members to published rows, the post's own author
 * (posts_select_own) and an active admin (posts_select_admin /
 * comments_select_admin) have broader SELECT policies that would otherwise
 * leak their own hidden/deleted content into this public detail page for
 * themselves — exactly the risk F5-D1 §6 calls out. The `comments(count)`
 * aggregate on the post row additionally needs its own explicit
 * `comments.status` filter for the same reason — see
 * lib/posts/mapRows.ts's doc comment for the empirically-confirmed finding
 * (F5-D1b §5).
 *
 * A genuine DB failure (posts query, comments query, or the author batch
 * RPC — F5-D1b §3 case B) is distinguished from "not found" by throwing —
 * Next.js then renders the nearest error.tsx with a real HTTP 500,
 * confirmed empirically in both `next dev` and a production `next
 * build`/`next start` (F5-D1b §2): the status line is `500`, and in
 * production the response body carries only an opaque `digest`, never the
 * thrown error's message or stack. This is deliberately different from the
 * 200-with-inline-message pattern app/fans/[username]/page.tsx uses — F5-D1
 * §4 explicitly requires 404 and 500 to be distinguishable statuses for
 * this page.
 */
async function fetchPostDetail(id: string, viewerId: string | null): Promise<PostDetailResult | null> {
  if (!UUID_SHAPE.test(id)) {
    return null;
  }

  const supabase = await createSupabaseServerClient();

  const { data: postRow, error: postError } = await supabase
    .from("posts")
    .select("id, author_id, post_type, event_id, content, created_at, likes(count), comments(count)")
    .eq("id", id)
    .eq("status", "published")
    .eq("comments.status", "published")
    .maybeSingle<PostDetailRow>();

  if (postError) {
    console.error("feed detail: posts query failed", postError.message);
    throw new Error("FEED_DETAIL_FETCH_FAILED");
  }
  if (!postRow) {
    // Nonexistent id, hidden/deleted post, or RLS-invisible (banned
    // community-browsing gate, bidirectional block) are all the same
    // zero-row outcome — never distinguished, same existence-oracle-safe
    // design as get_public_profile() / get_public_song().
    return null;
  }

  const { data: commentRows, error: commentsError } = await supabase
    .from("comments")
    .select(COMMENT_LIST_SELECT_COLUMNS)
    .eq("post_id", id)
    .eq("status", "published")
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(INITIAL_COMMENT_PAGE_SIZE);

  if (commentsError) {
    console.error("feed detail: comments query failed", commentsError.message);
    throw new Error("FEED_DETAIL_FETCH_FAILED");
  }

  const rawComments = (commentRows ?? []) as CommentListRow[];
  const authorIds = [postRow.author_id, ...rawComments.map((row) => row.author_id)];
  if (viewerId) {
    // F5-D3: the viewer's own public author info (for optimistically
    // rendering a comment they just posted) is folded into this same
    // batch lookup rather than a second round-trip. Deduped below same as
    // every other id in this list.
    authorIds.push(viewerId);
  }
  const firstUrl = extractFirstUrl(postRow.content);

  // 施策3（2026-10-27パフォーマンス調査）: the author batch lookup and the
  // link-preview lookup are mutually independent (the author lookup never
  // reads post.content's URL; the link-preview lookup never reads author
  // ids), so they run in parallel. Neither depends on the other's result,
  // and both already only ever read data belonging to this one
  // already-visibility-checked post (postRow is non-null at this point —
  // see the early `return null` above), so parallelizing exposes nothing
  // that sequential execution wouldn't have.
  //
  // At most 1 (post author) + INITIAL_COMMENT_PAGE_SIZE (20) + 1 (viewer)
  // distinct ids before dedup — well under get_public_profiles_by_ids()'s
  // 50-id cap (F5-D1b §4's explicit requirement).
  const [authorLookup, linkPreviewMap] = await Promise.all([
    fetchAuthorsByIds(supabase, authorIds),
    firstUrl ? fetchLinkPreviewsByUrls(supabase, [firstUrl]) : Promise.resolve(new Map()),
  ]);

  // F5-D1b §3 case B: the author RPC itself failing is a real backend
  // failure — surfaced the same way a posts/comments query failure is
  // (throw → real HTTP 500), never silently rendered as if every author
  // were simply absent.
  if (!authorLookup.ok) {
    throw new Error("FEED_DETAIL_FETCH_FAILED");
  }

  const post: PublicPostDetail = {
    id: postRow.id,
    author_id: postRow.author_id,
    post_type: toPostType(postRow.post_type),
    event_id: postRow.event_id,
    content: postRow.content,
    created_at: postRow.created_at,
    like_count: postRow.likes?.[0]?.count ?? 0,
    comment_count: postRow.comments?.[0]?.count ?? 0,
    author: authorLookup.authors.get(postRow.author_id) ?? null,
    linkPreviewUrl: firstUrl,
    linkPreview: firstUrl ? linkPreviewMap.get(firstUrl) ?? null : null,
  };

  const comments = rawComments.map((row) => mapCommentListRow(row, authorLookup.authors));

  return {
    post,
    comments,
    commentsHasMore: rawComments.length === INITIAL_COMMENT_PAGE_SIZE,
    authors: authorLookup.authors,
  };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const result = await fetchPostDetail(id, null);

  if (!result) {
    return { title: "投稿が見つかりません" };
  }

  const authorLabel = result.post.author?.display_name ?? "会員";
  const title = `${authorLabel}さんの投稿`;
  const description = result.post.content.slice(0, 120);

  return buildPageMetadata({ title, description, path: `/feed/${id}` });
}

// profiles.status / blocks can change between requests, and results depend
// on the viewer's own session — this page must never be served from a
// shared cache. cookies() inside createSupabaseServerClient() already
// forces dynamic rendering; kept explicit as defense-in-depth (same
// pattern as app/fans/[username]/page.tsx / app/music/[id]/page.tsx).
export const dynamic = "force-dynamic";

/**
 * /feed/[id] — public post detail (F5-D1 / F5-D1b). Server Component, no
 * auth guard: reachable by anonymous visitors, same as /feed and
 * /fans/[username].
 *
 * No loading.tsx exists for this segment (same reasoning as
 * app/music/[id]/page.tsx's doc comment): with no Suspense boundary above
 * the notFound() call, Next.js renders this page to completion
 * server-side before streaming starts, so a nonexistent/hidden/
 * deleted/blocked id gets a genuine HTTP 404 instead of a 200 "soft 404".
 */
export default async function PostDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // F5-D2 / F5-D3: edit/delete/comment/like affordances depend on who the
  // viewer is, so access must be resolved before fetchPostDetail() (which
  // folds the viewer's own id into its single author batch lookup — see
  // its own doc comment). This is a UI-only convenience in every case
  // below; RLS (posts_update_own / delete_own_post() / comments_insert_own
  // / comments_update_own / delete_own_comment() / likes_insert_own /
  // likes_delete_own) independently re-checks ownership, active status,
  // and block state regardless of what this page renders.
  const access = await getMemberAccess();
  const supabase = await createSupabaseServerClient();
  const viewerId = "userId" in access ? access.userId : null;
  const canWrite = access.kind === "member_active" || access.kind === "admin_active";

  const result = await fetchPostDetail(id, viewerId);

  if (!result) {
    notFound();
  }

  const { post, comments, commentsHasMore, authors } = result;
  const authorLabel = post.author?.display_name ?? UNAVAILABLE_AUTHOR_LABEL;
  const viewerAuthor = viewerId ? authors.get(viewerId) ?? null : null;
  const isOwner =
    (access.kind === "member_active" || access.kind === "admin_active") && access.userId === post.author_id;

  // F5-D3: own-like status, via likes_select_own (no status/block/parent
  // condition at all — always resolves for the viewer's own row
  // regardless of their current profile status). Only queried when
  // authenticated; anonymous visitors are always initialLiked=false and
  // see the login-prompt branch in LikeButton instead.
  // LIVE機能 Phase 4-B: whether this post has photos determines which
  // delete path PostOwnerActions uses (server API vs. the existing direct
  // browser call) — see that component's own doc comment.
  //
  // 施策3（2026-10-27パフォーマンス調査）: these two existence checks read
  // different tables (post_images vs likes) and neither's condition or
  // result depends on the other, so they run in parallel instead of one
  // after the other. Each individually still applies the exact same filter
  // (post_id, and for likes also user_id = this viewer) as before.
  const [hasImagesResult, initialLikedResult] = await Promise.all([
    post.post_type === "live_report"
      ? supabase.from("post_images").select("id").eq("post_id", post.id).limit(1).maybeSingle()
      : Promise.resolve(null),
    viewerId
      ? supabase.from("likes").select("id").eq("post_id", post.id).eq("user_id", viewerId).maybeSingle()
      : Promise.resolve(null),
  ]);

  let hasImages = false;
  if (post.post_type === "live_report" && hasImagesResult) {
    if (hasImagesResult.error) {
      console.error("feed detail: post_images existence check failed", hasImagesResult.error.message);
    } else {
      hasImages = Boolean(hasImagesResult.data);
    }
  }

  let initialLiked = false;
  if (viewerId && initialLikedResult) {
    if (initialLikedResult.error) {
      console.error("feed detail: own-like lookup failed", initialLikedResult.error.message);
    } else {
      initialLiked = Boolean(initialLikedResult.data);
    }
  }

  return (
    <main className="mx-auto min-w-0 max-w-2xl px-4 py-8 sm:px-6">
      <p className="mb-4">
        {post.event_id ? (
          <Link href={`/live/${post.event_id}`} className="text-sm font-bold text-brand underline-offset-2 hover:underline">
            ← LIVE掲示板へ戻る
          </Link>
        ) : (
          <Link href="/feed" className="text-sm font-bold text-brand underline-offset-2 hover:underline">
            ← 投稿一覧へ戻る
          </Link>
        )}
      </p>

      <span className="inline-block rounded-full bg-foreground/5 px-3 py-1 text-xs font-bold text-muted">
        {UNOFFICIAL_LABEL}
      </span>

      <Card className="mt-4 p-6 sm:p-8">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <AvatarInitial label={authorLabel} />
            <div className="min-w-0">
              <p className="truncate font-bold">{authorLabel}</p>
              {post.author ? (
                <Link
                  href={`/fans/${post.author.username}`}
                  className="truncate text-sm text-muted hover:underline"
                >
                  @{post.author.username}
                </Link>
              ) : null}
            </div>
          </div>
          <span className="shrink-0 rounded-full bg-foreground/5 px-2 py-1 text-xs font-bold text-muted">
            {POST_TYPE_LABEL[post.post_type] ?? post.post_type}
          </span>
        </div>

        <PostContentText
          content={post.content}
          className="mt-6 whitespace-pre-wrap border-t border-border pt-6 text-sm leading-relaxed [overflow-wrap:anywhere]"
        />

        {post.linkPreview && post.linkPreviewUrl ? (
          <LinkPreviewCard url={post.linkPreviewUrl} preview={post.linkPreview} />
        ) : null}

        {post.post_type === "live_report" ? <PostImageGallery postId={post.id} /> : null}

        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted">
          <span>{formatPostDate(post.created_at)}</span>
          <LikeButton
            postId={post.id}
            userId={viewerId}
            initialLiked={initialLiked}
            initialCount={post.like_count}
            canAddLike={canWrite}
            isLoggedOut={access.kind === "unauthenticated" || access.kind === "invalid"}
          />
          <span>コメント {post.comment_count}</span>
        </div>

        {isOwner ? (
          <PostOwnerActions postId={post.id} hasImages={hasImages} redirectTo={post.event_id ? `/live/${post.event_id}` : "/feed"} />
        ) : (
          <div className="mt-4">
            <ReportButton
              targetType="post"
              targetId={post.id}
              canReport={canWrite}
              isLoggedOut={access.kind === "unauthenticated" || access.kind === "invalid"}
            />
          </div>
        )}
      </Card>

      <div className="mt-6">
        <h2 className="text-lg font-bold">コメント</h2>
        <CommentSection
          postId={post.id}
          initialComments={comments}
          initialHasMore={commentsHasMore}
          commentCount={post.comment_count}
          currentUserId={viewerId}
          canComment={canWrite}
          isLoggedOut={access.kind === "unauthenticated" || access.kind === "invalid"}
          viewerAuthor={viewerAuthor}
        />
      </div>
    </main>
  );
}
