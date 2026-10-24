"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";

import { buttonClassName } from "@/components/ui/Button";
import {
  countContentCodePoints,
  normalizeContent,
  POST_CONTENT_MAX_LENGTH,
  validateNormalizedContent,
} from "@/lib/posts/validation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const TEXTAREA_CLASS =
  "mt-1 w-full rounded-xl border border-border bg-background px-4 py-3 text-base text-foreground placeholder:text-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-50";

type PostFormProps =
  | { mode: "create"; userId: string }
  | { mode: "create-live"; userId: string; eventId: string }
  | { mode: "edit"; postId: string; initialContent: string };

/**
 * F5-D2: shared create/edit form for posts.content (text-only MVP —
 * image_url/status are never part of this form or its payload).
 * `mode: "create-live"` (LIVE機能 Phase 3) reuses the exact same validation/
 * submit/double-submit-guard logic as `mode: "create"`, only adding
 * `post_type: "live_report"` and the target LIVE's `event_id` to the insert
 * payload — posts_insert_own (M18) is what actually authorizes which event a
 * live_report may reference; this component does not duplicate that check.
 * Mirrors components/me/ProfileEditForm.tsx's established
 * pattern closely: client-side pre-validation mirroring the DB CHECK
 * constraint, an explicit minimal payload (never a spread of broader
 * state), a direct Supabase call from the browser (RLS is the actual
 * authorization boundary, not this component — no service_role, no API
 * route bypassing it), and an update-result row-count check rather than
 * trusting the absence of an error.
 *
 * `userId` (create mode only) comes from a server-verified prop —
 * resolveMemberAccess()'s own cookie-authenticated result, passed down
 * from app/feed/new/page.tsx — never read from anything client-supplied.
 * Even if that were somehow tampered with, posts_insert_own's WITH CHECK
 * (`author_id = auth.uid()`) is the real enforcement boundary and would
 * reject any mismatch regardless of what this component sends.
 */
export function PostForm(props: PostFormProps) {
  const router = useRouter();
  const [content, setContent] = useState(props.mode === "edit" ? props.initialContent : "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Double-submit guard: `pending` (React state) is NOT safe for this by
  // itself — setState batching means several synchronous clicks/Enter
  // keypresses in the same tick can all read the same stale `pending ===
  // false` before any re-render lands, letting multiple submits through
  // (confirmed empirically: 3 rapid clicks created 3 posts before this
  // fix). `submittingRef` is a plain mutable ref, updated synchronously
  // and immediately on the very first call, so every subsequent call in
  // the same tick sees the updated value. `pending` state is kept only to
  // drive the UI (disabled attribute, button label).
  const submittingRef = useRef(false);

  const codePointCount = countContentCodePoints(normalizeContent(content));
  const overLimit = codePointCount > POST_CONTENT_MAX_LENGTH;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submittingRef.current) {
      return;
    }
    submittingRef.current = true;
    setError(null);

    const normalized = normalizeContent(content);
    const validationError = validateNormalizedContent(normalized, POST_CONTENT_MAX_LENGTH);
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
      console.error("post form: failed to create Supabase browser client", clientError);
      setError(
        props.mode === "create"
          ? "投稿できませんでした。しばらくしてから再度お試しください。"
          : "更新できませんでした。しばらくしてから再度お試しください。"
      );
      setPending(false);
      submittingRef.current = false;
      return;
    }

    try {
      if (props.mode === "create" || props.mode === "create-live") {
        const { data, error: insertError } =
          props.mode === "create-live"
            ? await supabase
                .from("posts")
                .insert({ author_id: props.userId, content: normalized, post_type: "live_report", event_id: props.eventId })
                .select("id")
                .single()
            : await supabase.from("posts").insert({ author_id: props.userId, content: normalized }).select("id").single();

        if (insertError || !data) {
          console.error("post form: insert failed", insertError?.code, insertError?.message);
          const message =
            insertError?.code === "23514"
              ? "入力内容をご確認ください（文字数や形式が正しくない可能性があります）。"
              : "投稿できませんでした。しばらくしてから再度お試しください。";
          setError(message);
          setPending(false);
          submittingRef.current = false;
          return;
        }

        router.push(props.mode === "create-live" ? `/live/${props.eventId}` : `/feed/${data.id}`);
        return;
      }

      // mode === "edit": explicit single-key payload — never status,
      // post_type, event_id, image_url, or author_id. The column-level
      // GRANT on public.posts only permits authenticated to UPDATE
      // content/image_url in the first place (F5-A audit), so any attempt
      // to include another column would be rejected by the DB wholesale —
      // this literal is defense-in-depth on top of that, not the only
      // safeguard.
      const { data, error: updateError } = await supabase
        .from("posts")
        .update({ content: normalized })
        .eq("id", props.postId)
        .select("id");

      if (updateError) {
        console.error("post form: update failed", updateError.code, updateError.message);
        const message =
          updateError.code === "23514"
            ? "入力内容をご確認ください（文字数や形式が正しくない可能性があります）。"
            : "更新できませんでした。しばらくしてから再度お試しください。";
        setError(message);
        setPending(false);
        submittingRef.current = false;
        return;
      }

      // A successful request with zero affected rows is NOT success:
      // posts_update_own's USING clause silently excludes any row that no
      // longer satisfies author_id = auth.uid() AND is_active_user() AND
      // status = 'published' — e.g. the account was suspended/banned, or
      // the post was hidden/deleted by the time this request reached the
      // DB. Same reasoning as components/me/ProfileEditForm.tsx's own
      // UPDATE-result check.
      if (!data || data.length !== 1 || data[0].id !== props.postId) {
        console.error("post form: unexpected update result", data?.length ?? 0);
        setError("更新できませんでした。投稿の状態をご確認いただくか、しばらくしてから再度お試しください。");
        setPending(false);
        submittingRef.current = false;
        return;
      }

      router.push(`/feed/${props.postId}`);
    } catch (fetchError) {
      console.error("post form: request threw", fetchError);
      setError("通信エラーが発生しました。ネットワーク環境をご確認のうえ、再度お試しください。");
      setPending(false);
      submittingRef.current = false;
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div>
        <label htmlFor="post-content" className="block text-sm font-bold">
          本文
        </label>
        <textarea
          id="post-content"
          rows={10}
          required
          disabled={pending}
          value={content}
          onChange={(event) => setContent(event.target.value)}
          className={TEXTAREA_CLASS}
        />
        <p className={`mt-1 text-right text-xs ${overLimit ? "text-rose-600" : "text-muted"}`}>
          {codePointCount}/{POST_CONTENT_MAX_LENGTH}文字
        </p>
      </div>

      {error ? (
        <p role="alert" aria-live="polite" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
          {error}
        </p>
      ) : null}

      <button type="submit" disabled={pending} className={buttonClassName("primary", "w-full")}>
        {pending ? "送信中..." : props.mode === "edit" ? "更新する" : "投稿する"}
      </button>
    </form>
  );
}
