"use client";

import Link from "next/link";
import { useRef, useState } from "react";

import { buttonClassName } from "@/components/ui/Button";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

/**
 * F5-D3: like/unlike toggle for /feed/[id]. `likes` has no status column
 * and no soft-delete concept (supabase/migrations/20260920022832_core_schema.sql,
 * supabase/migrations/20260926210000_likes_rls.sql) — like = INSERT, unlike
 * = physical DELETE, and the UNIQUE(post_id, user_id) constraint is the
 * DB's own "1 user, 1 like per post" enforcement (defense-in-depth on top
 * of this button's own disabled-while-already-liked state).
 *
 * `likes_delete_own` has no status/active/block condition at all (audited
 * in F5-D3 §2) — unliking is unconditionally allowed for the like's own
 * owner regardless of the viewer's current profile status, so this button
 * stays interactive for "unlike" even when `canAddLike` is false (e.g. the
 * viewer was suspended/banned after already liking). Only *adding* a new
 * like requires `canAddLike` (mirrors likes_insert_own's `is_active_user()`
 * requirement).
 */
export function LikeButton({
  postId,
  userId,
  initialLiked,
  initialCount,
  canAddLike,
  isLoggedOut,
}: {
  postId: string;
  userId: string | null;
  initialLiked: boolean;
  initialCount: number;
  canAddLike: boolean;
  isLoggedOut: boolean;
}) {
  const [liked, setLiked] = useState(initialLiked);
  const [count, setCount] = useState(initialCount);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Same synchronous-guard reasoning as components/feed/PostForm.tsx: a
  // rapid double-click must never fire two INSERTs (which the UNIQUE
  // constraint would reject as an error, surfacing a confusing failure for
  // what the user experienced as a single click) or two DELETEs.
  const submittingRef = useRef(false);

  if (isLoggedOut) {
    return (
      <span className="inline-flex items-center gap-2 text-xs text-muted">
        <span>いいね {count}</span>
        <Link href="/login" className="font-bold text-brand hover:underline">
          ログインしていいねする
        </Link>
      </span>
    );
  }

  async function toggle() {
    if (submittingRef.current) {
      return;
    }
    submittingRef.current = true;
    setPending(true);
    setError(null);

    let supabase;
    try {
      supabase = createSupabaseBrowserClient();
    } catch (clientError) {
      console.error("like button: failed to create Supabase browser client", clientError);
      setError("操作できませんでした。しばらくしてから再度お試しください。");
      setPending(false);
      submittingRef.current = false;
      return;
    }

    try {
      if (liked) {
        const { error: deleteError, count: deletedCount } = await supabase
          .from("likes")
          .delete({ count: "exact" })
          .eq("post_id", postId)
          .eq("user_id", userId as string);

        if (deleteError) {
          console.error("like button: delete failed", deleteError.code, deleteError.message);
          setError("いいねを解除できませんでした。しばらくしてから再度お試しください。");
          setPending(false);
          submittingRef.current = false;
          return;
        }
        if (!deletedCount) {
          // Already not liked (e.g. a second tab already unliked it) —
          // resync the UI to that reality rather than assuming success.
          console.error("like button: unlike affected 0 rows");
        }
        setLiked(false);
        setCount((previous) => Math.max(0, previous - 1));
      } else {
        const { error: insertError } = await supabase
          .from("likes")
          .insert({ post_id: postId, user_id: userId as string });

        if (insertError) {
          console.error("like button: insert failed", insertError.code, insertError.message);
          const message =
            insertError.code === "23505"
              ? null // already liked (e.g. another tab) — resync below, not an error
              : "いいねできませんでした。しばらくしてから再度お試しください。";
          if (message) {
            setError(message);
            setPending(false);
            submittingRef.current = false;
            return;
          }
        }
        setLiked(true);
        setCount((previous) => previous + 1);
      }
      setPending(false);
      submittingRef.current = false;
    } catch (fetchError) {
      console.error("like button: request threw", fetchError);
      setError("通信エラーが発生しました。ネットワーク環境をご確認のうえ、再度お試しください。");
      setPending(false);
      submittingRef.current = false;
    }
  }

  const disabled = pending || (!liked && !canAddLike);

  return (
    <span className="inline-flex flex-col gap-1">
      <span className="inline-flex items-center gap-2">
        <button
          type="button"
          onClick={() => void toggle()}
          disabled={disabled}
          aria-pressed={liked}
          className={buttonClassName(liked ? "primary" : "secondary", "px-4 py-1.5 text-xs")}
        >
          {pending ? "処理中..." : liked ? "いいね済み（解除）" : "いいね"}
        </button>
        <span className="text-xs text-muted">{count}</span>
      </span>
      {error ? (
        <span role="alert" aria-live="polite" className="text-xs text-rose-700">
          {error}
        </span>
      ) : null}
    </span>
  );
}
