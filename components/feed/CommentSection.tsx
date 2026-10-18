"use client";

import { useCallback, useRef, useState } from "react";

import { CommentForm } from "@/components/feed/CommentForm";
import { CommentList } from "@/components/feed/CommentList";
import { buttonClassName } from "@/components/ui/Button";
import type { PublicComment, PublicPostAuthor } from "@/lib/posts/types";

/**
 * F5-D1b §4 / F5-D3: "load more" pagination for a single post's comments,
 * going through GET /api/feed/[id]/comments (same requestId-guard
 * architecture as components/feed/FeedList.tsx — the only structural
 * difference is the cursor direction, ascending here since comments
 * display oldest-first), plus (F5-D3) posting a new comment and each
 * comment's own edit/delete, which only ever mutate local state in
 * response to a server-confirmed success — never optimistically before
 * that.
 */
export function CommentSection({
  postId,
  initialComments,
  initialHasMore,
  commentCount,
  currentUserId,
  canComment,
  isLoggedOut,
  viewerAuthor,
}: {
  postId: string;
  initialComments: PublicComment[];
  initialHasMore: boolean;
  commentCount: number;
  currentUserId: string | null;
  canComment: boolean;
  isLoggedOut: boolean;
  viewerAuthor: PublicPostAuthor | null;
}) {
  const [comments, setComments] = useState<PublicComment[]>(initialComments);
  const [count, setCount] = useState(commentCount);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const requestIdRef = useRef(0);

  const handleCreated = useCallback((comment: PublicComment) => {
    setComments((previous) => [...previous, comment]);
    setCount((previous) => previous + 1);
  }, []);

  const handleUpdated = useCallback((updated: PublicComment) => {
    setComments((previous) => previous.map((c) => (c.id === updated.id ? updated : c)));
  }, []);

  const handleDeleted = useCallback((commentId: string) => {
    setComments((previous) => previous.filter((c) => c.id !== commentId));
    setCount((previous) => Math.max(0, previous - 1));
  }, []);

  const loadMore = useCallback(async () => {
    const last = comments[comments.length - 1];
    if (!last) {
      return;
    }

    const myRequestId = ++requestIdRef.current;
    setLoadingMore(true);
    setError(null);

    const params = new URLSearchParams();
    params.set("after_created_at", last.created_at);
    params.set("after_id", last.id);

    try {
      const response = await fetch(`/api/feed/${postId}/comments?${params.toString()}`);

      if (myRequestId !== requestIdRef.current) {
        return; // A newer request has since started; discard this result.
      }

      if (!response.ok) {
        console.error("comment section: load more failed", response.status);
        setError("コメントの取得に失敗しました。");
        return;
      }

      const body = (await response.json()) as { comments: PublicComment[]; has_more: boolean };
      setComments((previous) => [...previous, ...body.comments]);
      setHasMore(Boolean(body.has_more));
    } catch (fetchError) {
      if (myRequestId !== requestIdRef.current) {
        return;
      }
      console.error("comment section: fetch threw", fetchError);
      setError("コメントの取得に失敗しました。");
    } finally {
      if (myRequestId === requestIdRef.current) {
        setLoadingMore(false);
      }
    }
  }, [comments, postId]);

  return (
    <div>
      {/* F5-D1b §4: comment_count (the published-only aggregate) and the
          number of comments actually rendered so far can legitimately
          differ while more pages remain — made explicit here rather than
          only implied by the "load more" button's presence. (F5-D3:
          `count` now also reflects this session's own create/delete
          actions, not just the server-rendered initial value.) */}
      <p className="mt-1 text-xs text-muted">
        {comments.length < count ? `${comments.length} / ${count}件を表示中` : `${count}件`}
      </p>

      {canComment ? (
        <CommentForm postId={postId} userId={currentUserId as string} viewerAuthor={viewerAuthor} onCreated={handleCreated} />
      ) : null}

      <CommentList
        comments={comments}
        currentUserId={currentUserId}
        canReport={canComment}
        isLoggedOut={isLoggedOut}
        onCommentUpdated={handleUpdated}
        onCommentDeleted={handleDeleted}
      />

      {error ? (
        <div role="alert" aria-live="polite" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
          <p>{error}</p>
          <button type="button" onClick={() => void loadMore()} className={buttonClassName("secondary", "mt-2")}>
            再試行
          </button>
        </div>
      ) : null}

      {hasMore ? (
        <div className="mt-4 flex justify-center">
          <button
            type="button"
            onClick={() => void loadMore()}
            disabled={loadingMore}
            className={buttonClassName("secondary")}
          >
            {loadingMore ? "読み込み中..." : "コメントをさらに読み込む"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
