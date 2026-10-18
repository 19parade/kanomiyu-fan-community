"use client";

import { useRef, useState, type FormEvent } from "react";

import { buttonClassName } from "@/components/ui/Button";
import {
  COMMENT_CONTENT_MAX_LENGTH,
  countContentCodePoints,
  normalizeContent,
  validateNormalizedContent,
} from "@/lib/posts/validation";
import type { PublicComment, PublicPostAuthor } from "@/lib/posts/types";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const TEXTAREA_CLASS =
  "mt-1 w-full rounded-xl border border-border bg-background px-4 py-3 text-sm text-foreground placeholder:text-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-50";

/**
 * F5-D3: new-comment form for an active member/admin on /feed/[id].
 * Mirrors components/feed/PostForm.tsx's established pattern closely
 * (client-side pre-validation mirroring comments_content_length_check,
 * explicit minimal INSERT payload, submittingRef double-submit guard,
 * preserving the typed content on failure so the user never loses their
 * draft). RLS (comments_insert_own) is the actual authorization boundary —
 * this form's `userId`/`viewerAuthor` props come from a server-verified
 * resolveMemberAccess() result, never from anything client-supplied.
 */
export function CommentForm({
  postId,
  userId,
  viewerAuthor,
  onCreated,
}: {
  postId: string;
  userId: string;
  viewerAuthor: PublicPostAuthor | null;
  onCreated: (comment: PublicComment) => void;
}) {
  const [content, setContent] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Double-submit guard: see components/feed/PostForm.tsx's identical
  // comment — `pending` (React state) alone cannot prevent several
  // synchronous submits in the same tick from all slipping past a
  // `pending === true` check before the first re-render lands.
  const submittingRef = useRef(false);

  const codePointCount = countContentCodePoints(normalizeContent(content));
  const overLimit = codePointCount > COMMENT_CONTENT_MAX_LENGTH;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submittingRef.current) {
      return;
    }
    submittingRef.current = true;
    setError(null);

    const normalized = normalizeContent(content);
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
      console.error("comment form: failed to create Supabase browser client", clientError);
      setError("コメントを投稿できませんでした。しばらくしてから再度お試しください。");
      setPending(false);
      submittingRef.current = false;
      return;
    }

    try {
      const { data, error: insertError } = await supabase
        .from("comments")
        .insert({ post_id: postId, author_id: userId, content: normalized })
        .select("id, author_id, content, created_at")
        .single();

      if (insertError || !data) {
        console.error("comment form: insert failed", insertError?.code, insertError?.message);
        const message =
          insertError?.code === "23514"
            ? "入力内容をご確認ください（文字数や形式が正しくない可能性があります）。"
            : "コメントを投稿できませんでした。しばらくしてから再度お試しください。";
        // Content is intentionally left in the textarea on failure (state is
        // untouched here) so the user never loses what they typed.
        setError(message);
        setPending(false);
        submittingRef.current = false;
        return;
      }

      onCreated({
        id: data.id,
        author_id: data.author_id,
        content: data.content,
        created_at: data.created_at,
        author: viewerAuthor,
      });
      setContent("");
      setPending(false);
      submittingRef.current = false;
    } catch (fetchError) {
      console.error("comment form: request threw", fetchError);
      setError("通信エラーが発生しました。ネットワーク環境をご確認のうえ、再度お試しください。");
      setPending(false);
      submittingRef.current = false;
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-2">
      <label htmlFor="comment-content" className="text-sm font-bold">
        コメントする
      </label>
      <textarea
        id="comment-content"
        rows={3}
        required
        disabled={pending}
        value={content}
        onChange={(event) => setContent(event.target.value)}
        className={TEXTAREA_CLASS}
        placeholder="コメントを入力してください"
      />
      <p className={`text-right text-xs ${overLimit ? "text-rose-600" : "text-muted"}`}>
        {codePointCount}/{COMMENT_CONTENT_MAX_LENGTH}文字
      </p>

      {error ? (
        <p role="alert" aria-live="polite" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
          {error}
        </p>
      ) : null}

      <div>
        <button type="submit" disabled={pending} className={buttonClassName("primary")}>
          {pending ? "送信中..." : "コメントする"}
        </button>
      </div>
    </form>
  );
}
