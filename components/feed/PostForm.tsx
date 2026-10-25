"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";

import { LinkPreviewCard } from "@/components/feed/LinkPreviewCard";
import { buttonClassName } from "@/components/ui/Button";
import { extractFirstUrl } from "@/lib/links/extract";
import { reencodeImageFile } from "@/lib/post-images/reencode";
import { uploadPostImage } from "@/lib/post-images/upload";
import type { PublicLinkPreview } from "@/lib/posts/types";
import {
  countContentCodePoints,
  normalizeContent,
  POST_CONTENT_MAX_LENGTH,
  validateNormalizedContent,
} from "@/lib/posts/validation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

// Debounce before triggering a link-preview fetch after the user stops
// typing/pasting — avoids calling the endpoint (and consuming its rate
// limit) on every keystroke while a URL is still being typed out.
const LINK_PREVIEW_DEBOUNCE_MS = 800;

const TEXTAREA_CLASS =
  "mt-1 w-full rounded-xl border border-border bg-background px-4 py-3 text-base text-foreground placeholder:text-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-50";

const MAX_POST_IMAGES = 4;

const UPLOAD_ERROR_MESSAGES: Record<string, string> = {
  FILE_TOO_LARGE: "画像のサイズが大きすぎます（1枚5MBまで）。",
  UNSUPPORTED_IMAGE_TYPE: "対応していない画像形式です（JPEG・PNG・WebPのみ）。",
  POST_IMAGE_UPLOAD_RATE_LIMITED: "画像のアップロードが多すぎます。しばらく時間をおいて再度お試しください。",
  UPLOAD_FAILED: "画像をアップロードできませんでした。",
};

// Exact RAISE EXCEPTION text from create_live_report_post() (supabase/
// migrations/20261026000000_post_images.sql) — matched verbatim, same
// convention as lib/events/errors.ts's mapEventDbError().
const LIVE_POST_ERROR_MESSAGES: Record<string, string> = {
  POST_NOT_AUTHORIZED: "投稿できませんでした。ログイン状態をご確認ください。",
  EVENT_NOT_AVAILABLE_FOR_POSTING: "このLIVEには投稿できません。",
  TOO_MANY_POST_IMAGES: "画像は4枚までです。",
  POST_IMAGE_NOT_OWNED: "画像のアップロードに問題が発生しました。もう一度お試しください。",
  LIVE_REPORT_RATE_LIMITED: "投稿が多すぎます。しばらく時間をおいて再度お試しください。",
};

type PostFormProps =
  | { mode: "create"; userId: string }
  | { mode: "create-live"; userId: string; eventId: string }
  | { mode: "edit"; postId: string; initialContent: string };

type SelectedImage = {
  id: string; // local-only key for the preview list, not a Storage key
  file: File;
  previewUrl: string;
};

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
  const [images, setImages] = useState<SelectedImage[]>([]);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

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

  // Link preview (2026-10-27 design review): the actual outbound fetch to
  // the posted URL happens exactly once, here, at compose time — never on
  // every later page view (see app/api/link-preview/route.ts's own doc
  // comment). `linkPreviewUrl` is pure derived state (computed every render
  // from `content`, never synced via useEffect) — only the async fetch
  // itself, and the `linkPreview` data it produces, are effects.
  // `lastFetchedUrlRef` prevents re-fetching while the user keeps typing
  // unrelated text after a URL that's already been resolved.
  const linkPreviewUrl = extractFirstUrl(normalizeContent(content));
  const [linkPreview, setLinkPreview] = useState<PublicLinkPreview | null>(null);
  const lastFetchedUrlRef = useRef<string | null>(null);

  useEffect(() => {
    if (linkPreviewUrl === lastFetchedUrlRef.current) {
      return;
    }
    if (!linkPreviewUrl) {
      // No setLinkPreview(null) here: the render below only ever shows the
      // preview when `linkPreviewUrl` is truthy, so stale `linkPreview`
      // state is already masked — nothing to clear.
      lastFetchedUrlRef.current = null;
      return;
    }

    const timer = setTimeout(() => {
      lastFetchedUrlRef.current = linkPreviewUrl;
      const controller = new AbortController();

      fetch("/api/link-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: normalizeContent(content) }),
        signal: controller.signal,
      })
        .then((response) => (response.ok ? response.json() : null))
        .then((body: { ok: boolean; preview: PublicLinkPreview | null } | null) => {
          // The user may have already changed the content again by the time
          // this resolves — only apply the result if it's still for the
          // most recently requested URL.
          if (lastFetchedUrlRef.current === linkPreviewUrl) {
            setLinkPreview(body?.ok ? body.preview : null);
          }
        })
        .catch((fetchError) => {
          if (fetchError?.name !== "AbortError") {
            console.error("post form: link preview fetch failed", fetchError);
          }
        });

      return () => controller.abort();
    }, LINK_PREVIEW_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [linkPreviewUrl, content]);

  // Image attachment is only offered in create-live mode (LIVE掲示板専用。
  // 通常フィードへの画像投稿は追加しない — PM要件).
  function handleFilesSelected(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    // Always clear the input value so selecting the exact same file again
    // later (after removing it) still fires a change event.
    event.target.value = "";
    if (files.length === 0) {
      return;
    }
    setImages((prev) => {
      const room = MAX_POST_IMAGES - prev.length;
      if (room <= 0) {
        return prev;
      }
      const accepted = files.slice(0, room).map((file) => ({
        id: `${file.name}-${file.lastModified}-${crypto.randomUUID()}`,
        file,
        previewUrl: URL.createObjectURL(file),
      }));
      return [...prev, ...accepted];
    });
  }

  function handleRemoveImage(id: string) {
    setImages((prev) => {
      const target = prev.find((image) => image.id === id);
      if (target) {
        URL.revokeObjectURL(target.previewUrl);
      }
      return prev.filter((image) => image.id !== id);
    });
  }

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
      if (props.mode === "create") {
        const { data, error: insertError } = await supabase
          .from("posts")
          .insert({ author_id: props.userId, content: normalized })
          .select("id")
          .single();

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

        router.push(`/feed/${data.id}`);
        return;
      }

      if (props.mode === "create-live") {
        // 1. re-encode + upload each selected image directly to Storage
        // (never through this app's own server — see
        // lib/post-images/upload.ts's doc comment). A failure at this step
        // aborts the whole submission: no post is created with a partial
        // set of images.
        const imageKeys: string[] = [];
        for (let i = 0; i < images.length; i += 1) {
          setUploadStatus(`画像をアップロード中... (${i + 1}/${images.length})`);
          const reencoded = await reencodeImageFile(images[i].file);
          if (!reencoded.ok) {
            setError("画像を処理できませんでした。別の画像でお試しください。");
            setPending(false);
            setUploadStatus(null);
            submittingRef.current = false;
            return;
          }
          const uploadResult = await uploadPostImage(supabase, reencoded.blob, reencoded.mime);
          if (!uploadResult.ok) {
            setError(UPLOAD_ERROR_MESSAGES[uploadResult.error] ?? "画像をアップロードできませんでした。");
            setPending(false);
            setUploadStatus(null);
            submittingRef.current = false;
            return;
          }
          imageKeys.push(uploadResult.key);
        }
        setUploadStatus(null);

        // 2. create the post + attach the uploaded images atomically
        // (create_live_report_post rolls back the post entirely if any key
        // fails its ownership check — see supabase/migrations/
        // 20261026000000_post_images.sql). Any already-uploaded-but-unused
        // Storage objects left behind by a failure here are picked up
        // later by the admin orphan cleanup endpoint, not compensated
        // immediately (see Phase 4-B design report).
        const { error: rpcError } = await supabase.rpc("create_live_report_post", {
          target_event_id: props.eventId,
          content: normalized,
          image_keys: imageKeys,
        });

        if (rpcError) {
          console.error("post form: create_live_report_post failed", rpcError.message);
          setError(LIVE_POST_ERROR_MESSAGES[rpcError.message] ?? "投稿できませんでした。しばらくしてから再度お試しください。");
          setPending(false);
          submittingRef.current = false;
          return;
        }

        router.push(`/live/${props.eventId}`);
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
        {linkPreviewUrl && linkPreview ? <LinkPreviewCard url={linkPreviewUrl} preview={linkPreview} /> : null}
      </div>

      {props.mode === "create-live" ? (
        <div>
          <label className="block text-sm font-bold">写真（任意、最大{MAX_POST_IMAGES}枚）</label>
          <p className="mt-1 text-xs text-muted">
            JPEG・PNG・WebP、1枚5MBまで。ご自身が著作権を持つ、または投稿の許可を得た写真のみ添付してください。
          </p>

          {images.length > 0 ? (
            <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {images.map((image) => (
                <li key={image.id} className="relative aspect-square overflow-hidden rounded-xl border border-border">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={image.previewUrl} alt="" className="h-full w-full object-cover" />
                  <button
                    type="button"
                    onClick={() => handleRemoveImage(image.id)}
                    disabled={pending}
                    aria-label="この画像を取り消す"
                    className="absolute right-1 top-1 rounded-full bg-black/60 px-2 py-1 text-xs font-bold text-white disabled:opacity-50"
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          ) : null}

          {images.length < MAX_POST_IMAGES ? (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={pending}
              className={buttonClassName("secondary", "mt-3")}
            >
              写真を選ぶ（あと{MAX_POST_IMAGES - images.length}枚）
            </button>
          ) : null}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            onChange={handleFilesSelected}
            disabled={pending}
            className="hidden"
          />

          {uploadStatus ? (
            <p role="status" aria-live="polite" className="mt-2 text-xs text-muted">
              {uploadStatus}
            </p>
          ) : null}
        </div>
      ) : null}

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
