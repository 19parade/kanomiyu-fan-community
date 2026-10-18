"use client";

import { useCallback, useRef, useState } from "react";

import { buttonClassName } from "@/components/ui/Button";
import { PostCard } from "@/components/feed/PostCard";
import type { PublicPostListItem } from "@/lib/posts/types";

/**
 * F5-D1: "load more" pagination for /feed, going through GET /api/feed
 * (see app/api/feed/route.ts), same architecture as
 * components/fans/FansList.tsx / components/music/MusicList.tsx. No
 * search in this phase (not requested) — only keyset "load more".
 */
export function FeedList({
  initialPosts,
  initialHasMore,
}: {
  initialPosts: PublicPostListItem[];
  initialHasMore: boolean;
}) {
  const [posts, setPosts] = useState<PublicPostListItem[]>(initialPosts);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Same requestId guard as FansList.tsx: discards a response from a
  // superseded "load more" click rather than appending it out of order.
  const requestIdRef = useRef(0);

  const loadMore = useCallback(async () => {
    const last = posts[posts.length - 1];
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
      const response = await fetch(`/api/feed?${params.toString()}`);

      if (myRequestId !== requestIdRef.current) {
        return; // A newer request has since started; discard this result.
      }

      if (!response.ok) {
        console.error("feed list: load more failed", response.status);
        setError("投稿の取得に失敗しました。");
        return;
      }

      const body = (await response.json()) as { posts: PublicPostListItem[]; has_more: boolean };
      setPosts((previous) => [...previous, ...body.posts]);
      setHasMore(Boolean(body.has_more));
    } catch (fetchError) {
      if (myRequestId !== requestIdRef.current) {
        return;
      }
      console.error("feed list: fetch threw", fetchError);
      setError("投稿の取得に失敗しました。");
    } finally {
      if (myRequestId === requestIdRef.current) {
        setLoadingMore(false);
      }
    }
  }, [posts]);

  return (
    <div className="mt-6">
      {error ? (
        <div role="alert" aria-live="polite" className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
          <p>{error}</p>
          <button type="button" onClick={() => void loadMore()} className={buttonClassName("secondary", "mt-2")}>
            再試行
          </button>
        </div>
      ) : null}

      {posts.length === 0 && !error ? (
        <div className="mt-6 flex flex-col items-center gap-3 rounded-2xl border border-border bg-surface px-6 py-12 text-center">
          <p className="text-muted">投稿はまだありません。</p>
        </div>
      ) : null}

      {posts.length > 0 ? (
        <ul className="flex flex-col gap-3">
          {posts.map((post) => (
            <li key={post.id} className="min-w-0">
              <PostCard post={post} />
            </li>
          ))}
        </ul>
      ) : null}

      {hasMore ? (
        <div className="mt-6 flex justify-center">
          <button
            type="button"
            onClick={() => void loadMore()}
            disabled={loadingMore}
            className={buttonClassName("secondary")}
          >
            {loadingMore ? "読み込み中..." : "さらに読み込む"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
