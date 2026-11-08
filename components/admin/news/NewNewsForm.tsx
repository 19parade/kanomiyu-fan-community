"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { buttonClassName } from "@/components/ui/Button";
import { jstDateToIso } from "@/lib/news/format";

const INPUT_CLASS =
  "mt-1 w-full rounded-xl border border-border bg-background px-4 py-3 text-base text-foreground placeholder:text-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-50";

const TITLE_MAX_LENGTH = 100; // UX hint only; internal.normalize_news_content() is authoritative.
const CONTENT_MAX_LENGTH = 5000; // same.

/**
 * Maps POST /api/admin/news's stable error codes (see app/api/admin/news/
 * route.ts and lib/news/errors.ts) to Japanese messages. Only codes this
 * endpoint can actually return are listed — no invented codes.
 */
const ERROR_MESSAGES: Record<string, string> = {
  INVALID_NEWS_TITLE: "タイトルを確認してください（1〜100文字で入力してください）。",
  INVALID_NEWS_CONTENT: "本文を確認してください（5000文字以内で入力してください）。",
  INVALID_NEWS_SOURCE_URL:
    "リンクURLを確認してください（https:// で始まるURL、またはサイト内の相対パス（/から始まる）のみ入力できます）。",
  INVALID_NEWS_PUBLISHED_AT: "日付を確認してください。",
  UNAUTHORIZED: "ログインが必要です。再度ログインしてください。",
  FORBIDDEN: "この操作を行う権限がありません。",
  ORIGIN_INVALID: "リクエストを処理できませんでした。ページを再読み込みしてからお試しください。",
};
const GENERIC_ERROR_MESSAGE = "保存できませんでした。";

/**
 * New news creation form (WHAT'S NEW機能). Submits JSON to
 * POST /api/admin/news. Unlike events/songs, the publish state is set
 * directly in this single form (see supabase/migrations/20261108050000_
 * news_admin_create.sql's doc comment for why news does not follow the
 * always-draft-then-publish convention).
 */
export function NewNewsForm() {
  const router = useRouter();

  const [title, setTitle] = useState("");
  const [publishedDate, setPublishedDate] = useState("");
  const [content, setContent] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [isPublished, setIsPublished] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (title.trim() === "") {
      setError(ERROR_MESSAGES.INVALID_NEWS_TITLE);
      return;
    }
    const publishedAtIso = jstDateToIso(publishedDate);
    if (!publishedAtIso) {
      setError(ERROR_MESSAGES.INVALID_NEWS_PUBLISHED_AT);
      return;
    }

    setPending(true);
    setError(null);

    try {
      const response = await fetch("/api/admin/news", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          published_at: publishedAtIso,
          content: content !== "" ? content : null,
          source_url: sourceUrl !== "" ? sourceUrl : null,
          is_published: isPublished,
        }),
      });

      const body = await response.json().catch(() => null);

      if (!response.ok) {
        const code = typeof body?.error === "string" ? body.error : null;
        setError((code && ERROR_MESSAGES[code]) ?? GENERIC_ERROR_MESSAGE);
        setPending(false);
        return;
      }

      const newId = typeof body?.id === "string" ? body.id : null;
      router.push(newId ? `/admin/news/${newId}` : "/admin/news");
    } catch (fetchError) {
      console.error("new news form: request failed", fetchError);
      setError(GENERIC_ERROR_MESSAGE);
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <div>
        <label htmlFor="new-news-title" className="block text-sm font-bold">
          タイトル
        </label>
        <input
          id="new-news-title"
          name="title"
          type="text"
          required
          maxLength={TITLE_MAX_LENGTH}
          value={title}
          disabled={pending}
          onChange={(event) => setTitle(event.target.value)}
          className={INPUT_CLASS}
        />
      </div>

      <div>
        <label htmlFor="new-news-date" className="block text-sm font-bold">
          日付
        </label>
        <input
          id="new-news-date"
          name="published_date"
          type="date"
          required
          value={publishedDate}
          disabled={pending}
          onChange={(event) => setPublishedDate(event.target.value)}
          className={INPUT_CLASS}
        />
      </div>

      <div>
        <label htmlFor="new-news-content" className="block text-sm font-bold">
          本文（任意）
        </label>
        <textarea
          id="new-news-content"
          name="content"
          rows={6}
          maxLength={CONTENT_MAX_LENGTH}
          value={content}
          disabled={pending}
          onChange={(event) => setContent(event.target.value)}
          className={INPUT_CLASS}
        />
        <p className="mt-1 text-xs text-muted">
          本文を入力すると、トップページのタイトルから詳細ページへ遷移できるようになります。
        </p>
      </div>

      <div>
        <label htmlFor="new-news-link" className="block text-sm font-bold">
          リンクURL（任意）
        </label>
        <input
          id="new-news-link"
          name="source_url"
          type="text"
          placeholder="https:// または /から始まるサイト内のパス"
          value={sourceUrl}
          disabled={pending}
          onChange={(event) => setSourceUrl(event.target.value)}
          className={INPUT_CLASS}
        />
        <p className="mt-1 text-xs text-muted">
          本文がない場合、このリンクへ直接遷移します。本文がある場合は詳細ページ内にリンクとして表示されます。
        </p>
      </div>

      <div className="flex items-center gap-2">
        <input
          id="new-news-is-published"
          name="is_published"
          type="checkbox"
          checked={isPublished}
          disabled={pending}
          onChange={(event) => setIsPublished(event.target.checked)}
          className="h-4 w-4 rounded border-border"
        />
        <label htmlFor="new-news-is-published" className="text-sm font-bold">
          公開する（チェックを外すと非公開として保存されます）
        </label>
      </div>

      {error ? (
        <p role="alert" aria-live="polite" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
          {error}
        </p>
      ) : null}

      <button type="submit" disabled={pending} className={buttonClassName("primary", "w-full")}>
        {pending ? "保存中..." : "保存"}
      </button>
    </form>
  );
}
