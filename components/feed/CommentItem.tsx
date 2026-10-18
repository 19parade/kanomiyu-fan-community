"use client";

import { useRef, useState } from "react";

import { AvatarInitial } from "@/components/ui/AvatarInitial";
import { buttonClassName } from "@/components/ui/Button";
import { ReportButton } from "@/components/feed/ReportButton";
import { formatPostDate, UNAVAILABLE_AUTHOR_LABEL } from "@/lib/posts/format";
import {
  COMMENT_CONTENT_MAX_LENGTH,
  countContentCodePoints,
  normalizeContent,
  validateNormalizedContent,
} from "@/lib/posts/validation";
import type { PublicComment } from "@/lib/posts/types";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const TEXTAREA_CLASS =
  "mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-50";

/**
 * F5-D3: one comment row, with inline edit/delete for the comment's own
 * author. Every comment this component ever receives comes from a query
 * already filtered to `status = 'published'` (comments_select_own has no
 * status condition, but the list this renders from is always the
 * fan-facing published-only page — see components/feed/CommentSection.tsx)
 * — so "hidden/deletedコメントは編集不可" needs no extra client-side
 * branch here: such a comment never reaches this component as an editable
 * item in the first place. The same reasoning applies to a now-blocked
 * post author: if a block exists between the viewer and the post's author,
 * posts_select_visible_authenticated already makes the whole post (and
 * therefore this comment list) RLS-invisible, so this component is never
 * rendered for that case through the normal UI flow either. RLS
 * (comments_update_own / delete_own_comment()) remains the real
 * enforcement boundary regardless — this component never assumes an action
 * will succeed just because it is shown.
 */
export function CommentItem({
  comment,
  currentUserId,
  canReport,
  isLoggedOut,
  onUpdated,
  onDeleted,
}: {
  comment: PublicComment;
  currentUserId: string | null;
  canReport: boolean;
  isLoggedOut: boolean;
  onUpdated: (comment: PublicComment) => void;
  onDeleted: (commentId: string) => void;
}) {
  const isOwner = currentUserId !== null && comment.author_id === currentUserId;

  const [mode, setMode] = useState<"view" | "edit" | "delete-confirm">("view");
  const [editContent, setEditContent] = useState(comment.content);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Same synchronous-guard reasoning as components/feed/PostForm.tsx /
  // components/feed/PostOwnerActions.tsx: `pending` state alone cannot
  // prevent several rapid submits/clicks in the same tick from all
  // slipping past a stale `pending === false` read.
  const submittingRef = useRef(false);

  const authorLabel = comment.author?.display_name ?? UNAVAILABLE_AUTHOR_LABEL;
  const codePointCount = countContentCodePoints(normalizeContent(editContent));
  const overLimit = codePointCount > COMMENT_CONTENT_MAX_LENGTH;

  function enterEditMode() {
    submittingRef.current = false;
    setEditContent(comment.content);
    setError(null);
    setMode("edit");
  }

  function cancelEdit() {
    submittingRef.current = false;
    setError(null);
    setMode("view");
  }

  async function handleSaveEdit() {
    if (submittingRef.current) {
      return;
    }
    submittingRef.current = true;
    setError(null);

    const normalized = normalizeContent(editContent);
    const validationError = validateNormalizedContent(normalized, COMMENT_CONTENT_MAX_LENGTH);
    if (validationError) {
      setError(validationError);
      submittingRef.current = false;
      return;
    }

    setPending(true);

    let supabase;
    try {
      supabase = createSupabaseBrowserClient();
    } catch (clientError) {
      console.error("comment item: failed to create Supabase browser client", clientError);
      setError("更新できませんでした。しばらくしてから再度お試しください。");
      setPending(false);
      submittingRef.current = false;
      return;
    }

    try {
      const { data, error: updateError } = await supabase
        .from("comments")
        .update({ content: normalized })
        .eq("id", comment.id)
        .select("id, author_id, content, created_at");

      if (updateError) {
        console.error("comment item: update failed", updateError.code, updateError.message);
        const message =
          updateError.code === "23514"
            ? "入力内容をご確認ください（文字数や形式が正しくない可能性があります）。"
            : "更新できませんでした。しばらくしてから再度お試しください。";
        setError(message);
        setPending(false);
        submittingRef.current = false;
        return;
      }

      // A successful request with zero affected rows is NOT success — the
      // comment may have become hidden/deleted, the parent post may have
      // become invisible, or a block may now apply. Same reasoning as
      // components/feed/PostForm.tsx's own UPDATE-result check.
      if (!data || data.length !== 1) {
        console.error("comment item: unexpected update result", data?.length ?? 0);
        setError("更新できませんでした。コメントの状態をご確認いただくか、しばらくしてから再度お試しください。");
        setPending(false);
        submittingRef.current = false;
        return;
      }

      const updated = data[0];
      onUpdated({
        id: updated.id,
        author_id: updated.author_id,
        content: updated.content,
        created_at: updated.created_at,
        author: comment.author,
      });
      setPending(false);
      submittingRef.current = false;
      setMode("view");
    } catch (fetchError) {
      console.error("comment item: request threw", fetchError);
      setError("通信エラーが発生しました。ネットワーク環境をご確認のうえ、再度お試しください。");
      setPending(false);
      submittingRef.current = false;
    }
  }

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
      console.error("comment item: failed to create Supabase browser client", clientError);
      setError("削除できませんでした。しばらくしてから再度お試しください。");
      setPending(false);
      submittingRef.current = false;
      return;
    }

    try {
      const { error: rpcError } = await supabase.rpc("delete_own_comment", { target_comment_id: comment.id });

      if (rpcError) {
        console.error("comment item: delete_own_comment failed", rpcError.code, rpcError.message);
        setError("削除できませんでした。しばらくしてから再度お試しください。");
        setPending(false);
        submittingRef.current = false;
        return;
      }

      // delete_own_comment() is void and existence-oracle-safe: a 0-row
      // match (not the caller's own comment, already deleted) is silent
      // success, never an error. The absence of an RPC error therefore
      // does not by itself prove deletion happened — re-fetch and require
      // status === 'deleted' before declaring success (same principle as
      // components/feed/PostOwnerActions.tsx).
      const { data: verifyRow, error: verifyError } = await supabase
        .from("comments")
        .select("status")
        .eq("id", comment.id)
        .maybeSingle<{ status: string }>();

      if (verifyError) {
        console.error("comment item: post-delete verification failed", verifyError.message);
        setError("削除結果を確認できませんでした。しばらくしてから再度お試しください。");
        setPending(false);
        submittingRef.current = false;
        return;
      }

      if (verifyRow?.status !== "deleted") {
        console.error("comment item: delete_own_comment was a silent no-op", verifyRow?.status);
        setError("削除できませんでした。しばらくしてから再度お試しください。");
        setPending(false);
        submittingRef.current = false;
        return;
      }

      onDeleted(comment.id);
      // No local state reset needed: this component unmounts once the
      // parent removes the comment from its list.
    } catch (fetchError) {
      console.error("comment item: request threw", fetchError);
      setError("通信エラーが発生しました。ネットワーク環境をご確認のうえ、再度お試しください。");
      setPending(false);
      submittingRef.current = false;
    }
  }

  return (
    <li className="flex min-w-0 gap-3">
      <AvatarInitial label={authorLabel} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <p className="truncate text-sm font-bold">{authorLabel}</p>
          <p className="shrink-0 text-xs text-muted">{formatPostDate(comment.created_at)}</p>
        </div>

        {mode === "edit" ? (
          <div className="mt-1">
            <textarea
              rows={3}
              disabled={pending}
              value={editContent}
              onChange={(event) => setEditContent(event.target.value)}
              className={TEXTAREA_CLASS}
              aria-label="コメントを編集"
            />
            <p className={`text-right text-xs ${overLimit ? "text-rose-600" : "text-muted"}`}>
              {codePointCount}/{COMMENT_CONTENT_MAX_LENGTH}文字
            </p>
            <div className="mt-1 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void handleSaveEdit()}
                disabled={pending}
                className={buttonClassName("primary")}
              >
                {pending ? "保存中..." : "保存"}
              </button>
              <button type="button" onClick={cancelEdit} disabled={pending} className={buttonClassName("ghost")}>
                キャンセル
              </button>
            </div>
          </div>
        ) : (
          <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed [overflow-wrap:anywhere]">{comment.content}</p>
        )}

        {error ? (
          <p role="alert" aria-live="polite" className="mt-1 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-900">
            {error}
          </p>
        ) : null}

        {isOwner && mode === "view" ? (
          <div className="mt-1 flex flex-wrap gap-3">
            <button type="button" onClick={enterEditMode} className="text-xs font-bold text-brand hover:underline">
              編集
            </button>
            <button
              type="button"
              onClick={() => setMode("delete-confirm")}
              className="text-xs font-bold text-rose-700 hover:underline"
            >
              削除
            </button>
          </div>
        ) : null}

        {!isOwner && mode === "view" ? (
          <div className="mt-1">
            <ReportButton targetType="comment" targetId={comment.id} canReport={canReport} isLoggedOut={isLoggedOut} />
          </div>
        ) : null}

        {isOwner && mode === "delete-confirm" ? (
          <div role="alertdialog" aria-label="コメントの削除確認" className="mt-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2">
            <p className="text-xs text-rose-900">このコメントを削除しますか？削除すると元に戻せません。</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void handleDelete()}
                disabled={pending}
                className={buttonClassName("primary")}
              >
                {pending ? "削除中..." : "削除する"}
              </button>
              <button
                type="button"
                onClick={() => {
                  submittingRef.current = false;
                  setMode("view");
                }}
                disabled={pending}
                className={buttonClassName("ghost")}
              >
                キャンセル
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </li>
  );
}
