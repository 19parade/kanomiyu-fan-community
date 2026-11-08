"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { buttonClassName } from "@/components/ui/Button";
import { isoToJstDateValue, jstDateToIso } from "@/lib/news/format";

const INPUT_CLASS =
  "mt-1 w-full rounded-xl border border-border bg-background px-4 py-3 text-base text-foreground placeholder:text-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-50";

const TITLE_MAX_LENGTH = 100;
const CONTENT_MAX_LENGTH = 5000;

/**
 * Maps PATCH /api/admin/news/[id]'s stable error codes (see
 * lib/news/errors.ts) to Japanese messages. NEWS_CONFLICT is handled
 * separately (dedicated conflict UI, never shown as a generic message here)
 * — same pattern as components/admin/events/EditEventForm.tsx.
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
  INVALID_NEWS_VERSION: "保存情報が古くなっています。最新内容を読み込み直してください。",
  NEWS_NOT_FOUND: "このお知らせは見つかりませんでした。一覧から再度お試しください。",
  INVALID_REQUEST: "入力内容を確認してください。",
};
const GENERIC_ERROR_MESSAGE = "保存できませんでした。";
const DELETE_ERROR_MESSAGE = "削除できませんでした。";

type EditNewsFormProps = {
  newsId: string;
  initialTitle: string;
  initialPublishedAt: string;
  initialContent: string | null;
  initialSourceUrl: string | null;
  initialIsPublished: boolean;
  initialUpdatedAt: string;
};

/**
 * News edit form (WHAT'S NEW機能), mirroring components/admin/events/
 * EditEventForm.tsx's structure (content save sharing one `versionToken`,
 * 409-conflict UI, no auto-overwrite/auto-retry) — minus the image upload
 * (no image field in this feature) and minus the separate status-action
 * buttons (公開状態 is one plain field in the same full-replace save, per
 * supabase/migrations/20261108060000_news_admin_update.sql's doc comment).
 *
 * Also hosts the 削除 action (window.confirm() guard, same pattern as
 * EditEventForm.tsx's status-change confirmations) since this is the only
 * action that leaves this page (navigates back to the list on success).
 *
 * `versionToken` is carried as the exact raw `updated_at` string end to
 * end — never `new Date(...)`, never reformatted.
 */
export function EditNewsForm({
  newsId,
  initialTitle,
  initialPublishedAt,
  initialContent,
  initialSourceUrl,
  initialIsPublished,
  initialUpdatedAt,
}: EditNewsFormProps) {
  const router = useRouter();

  const [title, setTitle] = useState(initialTitle);
  const [publishedDate, setPublishedDate] = useState(isoToJstDateValue(initialPublishedAt));
  const [content, setContent] = useState(initialContent ?? "");
  const [sourceUrl, setSourceUrl] = useState(initialSourceUrl ?? "");
  const [isPublished, setIsPublished] = useState(initialIsPublished);

  const [versionToken, setVersionToken] = useState(initialUpdatedAt);

  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

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
    setConflict(false);
    setSuccessMessage(null);

    try {
      const response = await fetch(`/api/admin/news/${newsId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expected_updated_at: versionToken,
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

        if (code === "NEWS_CONFLICT") {
          setConflict(true);
          setPending(false);
          return;
        }

        setError((code && ERROR_MESSAGES[code]) ?? GENERIC_ERROR_MESSAGE);
        setPending(false);
        return;
      }

      const newUpdatedAt = typeof body?.updated_at === "string" ? body.updated_at : versionToken;
      setVersionToken(newUpdatedAt);
      setSuccessMessage("保存しました。");
      setPending(false);
    } catch (fetchError) {
      console.error("edit news form: request failed", fetchError);
      setError(GENERIC_ERROR_MESSAGE);
      setPending(false);
    }
  }

  async function handleDelete() {
    if (!window.confirm(`「${title}」を削除しますか？この操作は取り消せません。`)) {
      return;
    }

    setDeleting(true);
    setError(null);

    try {
      const response = await fetch(`/api/admin/news/${newsId}`, { method: "DELETE" });
      if (!response.ok) {
        console.error("edit news form: delete failed", response.status);
        setError(DELETE_ERROR_MESSAGE);
        setDeleting(false);
        return;
      }
      router.push("/admin/news");
    } catch (deleteError) {
      console.error("edit news form: delete threw", deleteError);
      setError(DELETE_ERROR_MESSAGE);
      setDeleting(false);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <div>
          <label htmlFor="edit-news-title" className="block text-sm font-bold">
            タイトル
          </label>
          <input
            id="edit-news-title"
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
          <label htmlFor="edit-news-date" className="block text-sm font-bold">
            日付
          </label>
          <input
            id="edit-news-date"
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
          <label htmlFor="edit-news-content" className="block text-sm font-bold">
            本文（任意）
          </label>
          <textarea
            id="edit-news-content"
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
          <label htmlFor="edit-news-link" className="block text-sm font-bold">
            リンクURL（任意）
          </label>
          <input
            id="edit-news-link"
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
            id="edit-news-is-published"
            name="is_published"
            type="checkbox"
            checked={isPublished}
            disabled={pending}
            onChange={(event) => setIsPublished(event.target.checked)}
            className="h-4 w-4 rounded border-border"
          />
          <label htmlFor="edit-news-is-published" className="text-sm font-bold">
            公開する（チェックを外すと非公開として保存されます）
          </label>
        </div>

        {conflict ? (
          <div role="alert" aria-live="polite" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <p>{ERROR_MESSAGES.INVALID_NEWS_VERSION}</p>
            <button
              type="button"
              onClick={() => router.refresh()}
              className={buttonClassName("secondary", "mt-2")}
            >
              最新内容を読み込み直す
            </button>
          </div>
        ) : null}

        {error ? (
          <p role="alert" aria-live="polite" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
            {error}
          </p>
        ) : null}

        {successMessage ? (
          <p role="status" aria-live="polite" className="text-sm font-bold text-brand">
            {successMessage}
          </p>
        ) : null}

        <button type="submit" disabled={pending} className={buttonClassName("primary", "w-full")}>
          {pending ? "保存中..." : "保存"}
        </button>
      </form>

      <div className="border-t border-border pt-6">
        <h2 className="text-sm font-bold text-muted">このお知らせを削除</h2>
        <p className="mt-1 text-sm text-muted">削除すると元に戻せません。削除前に確認画面が表示されます。</p>
        <button
          type="button"
          onClick={handleDelete}
          disabled={deleting}
          className={buttonClassName("secondary", "mt-3 border-rose-200 text-rose-700 hover:bg-rose-50")}
        >
          {deleting ? "削除中..." : "削除する"}
        </button>
      </div>
    </div>
  );
}
