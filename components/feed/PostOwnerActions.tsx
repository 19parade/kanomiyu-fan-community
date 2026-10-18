"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { buttonClassName } from "@/components/ui/Button";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

/**
 * F5-D2: edit link + delete (with confirmation) for the post's own author,
 * rendered only on /feed/[id] when the Server Component has already
 * confirmed `post.author_id === viewer.userId` (see app/feed/[id]/page.tsx)
 * — this component itself performs no additional ownership check, since
 * posts_update_own / delete_own_post() both independently re-enforce
 * `author_id = auth.uid()` at the DB layer regardless of what this UI
 * shows.
 *
 * delete_own_post() returns void and is deliberately existence-oracle
 * safe: a 0-row match (not the caller's own post, or already deleted) is
 * NOT an error — it is documented as succeeding silently
 * (supabase/migrations/20260926090000_posts_rls.sql). The absence of an
 * RPC error therefore does not by itself prove the post was actually
 * deleted, so this component re-fetches the post's own status afterward
 * and only treats `status === 'deleted'` as real success — the same
 * "don't trust silence" principle components/me/ProfileEditForm.tsx
 * applies to its own UPDATE result.
 */
export function PostOwnerActions({ postId }: { postId: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Double-submit guard: see components/feed/PostForm.tsx's identical
  // comment — `pending` (React state) alone cannot prevent several
  // synchronous clicks in the same tick from all slipping past a
  // `pending === true` check before the first re-render lands.
  // `submittingRef` is the real, synchronous guard; `pending` state only
  // drives the UI.
  const submittingRef = useRef(false);

  async function handleDelete() {
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
      console.error("post owner actions: failed to create Supabase browser client", clientError);
      setError("削除できませんでした。しばらくしてから再度お試しください。");
      setPending(false);
      submittingRef.current = false;
      return;
    }

    try {
      const { error: rpcError } = await supabase.rpc("delete_own_post", { target_post_id: postId });

      if (rpcError) {
        console.error("post owner actions: delete_own_post failed", rpcError.code, rpcError.message);
        setError("削除できませんでした。しばらくしてから再度お試しください。");
        setPending(false);
        submittingRef.current = false;
        return;
      }

      const { data: verifyRow, error: verifyError } = await supabase
        .from("posts")
        .select("status")
        .eq("id", postId)
        .maybeSingle<{ status: string }>();

      if (verifyError) {
        console.error("post owner actions: post-delete verification failed", verifyError.message);
        setError("削除結果を確認できませんでした。しばらくしてから再度お試しください。");
        setPending(false);
        submittingRef.current = false;
        return;
      }

      if (verifyRow?.status !== "deleted") {
        console.error("post owner actions: delete_own_post was a silent no-op", verifyRow?.status);
        setError("削除できませんでした。投稿の状態をご確認いただくか、しばらくしてから再度お試しください。");
        setPending(false);
        submittingRef.current = false;
        return;
      }

      router.push("/feed");
    } catch (fetchError) {
      console.error("post owner actions: request threw", fetchError);
      setError("通信エラーが発生しました。ネットワーク環境をご確認のうえ、再度お試しください。");
      setPending(false);
      submittingRef.current = false;
    }
  }

  return (
    <div className="mt-4">
      <div className="flex flex-wrap gap-3">
        <Link href={`/feed/${postId}/edit`} className={buttonClassName("secondary")}>
          編集
        </Link>
        {!confirming ? (
          <button type="button" onClick={() => setConfirming(true)} className={buttonClassName("secondary")}>
            削除
          </button>
        ) : null}
      </div>

      {confirming ? (
        <div role="alertdialog" aria-label="投稿の削除確認" className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3">
          <p className="text-sm text-rose-900">
            この投稿を削除しますか？削除すると元に戻せません。
          </p>
          <div className="mt-3 flex flex-wrap gap-3">
            <button type="button" onClick={() => void handleDelete()} disabled={pending} className={buttonClassName("primary")}>
              {pending ? "削除中..." : "削除する"}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              disabled={pending}
              className={buttonClassName("ghost")}
            >
              キャンセル
            </button>
          </div>
        </div>
      ) : null}

      {error ? (
        <p role="alert" aria-live="polite" className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
          {error}
        </p>
      ) : null}
    </div>
  );
}
