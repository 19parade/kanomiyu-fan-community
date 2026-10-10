"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";

const TITLE_MAX_LENGTH = 100; // UX hint only; internal.normalize_song_content() is authoritative.
const DESCRIPTION_MAX_LENGTH = 5000; // same.
const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // mirrors lib/song-images/validate.ts's MAX_SONG_IMAGE_BYTES; UX hint only.

/**
 * Maps POST /api/admin/music's stable error codes (see app/api/admin/music/
 * route.ts and lib/song-images/errors.ts) to Japanese messages. Only codes
 * this endpoint can actually return are listed — no invented codes. Unknown
 * codes fall back to a generic message; the raw DB/Storage error text is
 * never shown.
 */
const ERROR_MESSAGES: Record<string, string> = {
  INVALID_SONG_TITLE: "タイトルを確認してください（1〜100文字で入力してください）。",
  INVALID_SONG_DESCRIPTION: "説明文を確認してください（5000文字以内で入力してください）。",
  INVALID_SONG_RELEASE_DATE: "発売日を確認してください。",
  INVALID_SONG_COVER_IMAGE_KEY: "カバー画像の処理中にエラーが発生しました。もう一度お試しください。",
  INVALID_UPLOAD: "画像ファイルを確認してください。",
  FILE_TOO_LARGE: "画像ファイルは5MB以下にしてください。",
  UNSUPPORTED_IMAGE_TYPE: "対応していない画像形式です（JPEG・PNG・WebPのみ利用できます）。",
  IMAGE_TYPE_MISMATCH: "画像ファイルの内容と拡張子が一致しません。",
  UPLOAD_FAILED: "画像のアップロードに失敗しました。もう一度お試しください。",
  UNAUTHORIZED: "ログインが必要です。再度ログインしてください。",
  FORBIDDEN: "この操作を行う権限がありません。",
  ORIGIN_INVALID: "リクエストを処理できませんでした。ページを再読み込みしてからお試しください。",
};
const GENERIC_ERROR_MESSAGE = "保存できませんでした。";

/**
 * New song creation form (A3). Submits directly to the existing
 * `POST /api/admin/music` (ST4, unchanged) using the exact multipart field
 * names that Route Handler reads (`title` / `release_date` / `description`
 * / `file`) — confirmed from app/api/admin/music/route.ts's source, not
 * guessed. Never calls Supabase or Storage directly from the browser.
 *
 * Always creates a draft: there is no status control in this form, and no
 * status field is ever sent (create_song's own contract always starts a
 * new song as 'draft' — see S5).
 *
 * On success, navigates to /admin/music/[id] (A4's edit page) using the id
 * the API response itself returns — never a client-generated id.
 */
export function NewSongForm() {
  const router = useRouter();

  const [title, setTitle] = useState("");
  const [releaseDate, setReleaseDate] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Revoke the object URL whenever it changes and on unmount — it is a
  // browser-local preview handle only, never sent anywhere and never
  // confused with the Storage object key the server returns.
  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0] ?? null;

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }

    if (selected === null) {
      setFile(null);
      setPreviewUrl(null);
      return;
    }

    // Client-side checks are UX-only — the server's magic-byte/size/MIME
    // validation (lib/song-images/validate.ts) remains authoritative and is
    // always re-run; a file that passes this check can still be rejected by
    // the server (and vice versa is never silently trusted).
    if (!ACCEPTED_IMAGE_TYPES.includes(selected.type)) {
      setError(ERROR_MESSAGES.UNSUPPORTED_IMAGE_TYPE);
      setFile(null);
      setPreviewUrl(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      return;
    }
    if (selected.size > MAX_IMAGE_BYTES) {
      setError(ERROR_MESSAGES.FILE_TOO_LARGE);
      setFile(null);
      setPreviewUrl(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      return;
    }

    setError(null);
    setFile(selected);
    setPreviewUrl(URL.createObjectURL(selected));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    // Supplementary client-side check only (DB normalization — trim then
    // length 1-100 — remains authoritative; this just avoids an obviously
    // pointless round trip for a whitespace-only title).
    if (title.trim() === "") {
      setError(ERROR_MESSAGES.INVALID_SONG_TITLE);
      return;
    }

    setPending(true);
    setError(null);

    const formData = new FormData();
    formData.append("title", title);
    if (releaseDate !== "") {
      formData.append("release_date", releaseDate);
    }
    if (description !== "") {
      formData.append("description", description);
    }
    if (file) {
      formData.append("file", file);
    }

    try {
      // Browser sets its own multipart boundary; Content-Type is never set
      // manually here (see A3 report / existing ST3-ST5 precedent).
      const response = await fetch("/api/admin/music", { method: "POST", body: formData });

      const body = await response.json().catch(() => null);

      if (!response.ok) {
        const code = typeof body?.error === "string" ? body.error : null;
        setError((code && ERROR_MESSAGES[code]) ?? GENERIC_ERROR_MESSAGE);
        setPending(false);
        return;
      }

      // A4's edit page now exists. Navigate using the id the API itself
      // returned — never a client-generated id.
      const newId = typeof body?.id === "string" ? body.id : null;
      router.push(newId ? `/admin/music/${newId}` : "/admin/music");
    } catch (fetchError) {
      console.error("new song form: request failed", fetchError);
      setError(GENERIC_ERROR_MESSAGE);
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <div>
        <label htmlFor="new-song-title">タイトル</label>
        <br />
        <input
          id="new-song-title"
          name="title"
          type="text"
          required
          maxLength={TITLE_MAX_LENGTH}
          value={title}
          disabled={pending}
          onChange={(event) => setTitle(event.target.value)}
        />
      </div>

      <div>
        <label htmlFor="new-song-release-date">発売日（任意）</label>
        <br />
        <input
          id="new-song-release-date"
          name="release_date"
          type="date"
          value={releaseDate}
          disabled={pending}
          onChange={(event) => setReleaseDate(event.target.value)}
        />
      </div>

      <div>
        <label htmlFor="new-song-description">説明文（任意）</label>
        <br />
        <textarea
          id="new-song-description"
          name="description"
          maxLength={DESCRIPTION_MAX_LENGTH}
          value={description}
          disabled={pending}
          onChange={(event) => setDescription(event.target.value)}
        />
      </div>

      <div>
        <label htmlFor="new-song-cover">カバー画像（任意。JPEG・PNG・WebP、5MB以下）</label>
        <br />
        <input
          id="new-song-cover"
          name="file"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          ref={fileInputRef}
          disabled={pending}
          onChange={handleFileChange}
        />
      </div>

      {previewUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={previewUrl} alt="選択したカバー画像のプレビュー" width={160} height={160} />
      ) : null}

      {error ? (
        <p role="alert" aria-live="polite">
          {error}
        </p>
      ) : null}

      <button type="submit" disabled={pending}>
        {pending ? "保存中..." : "下書きとして保存"}
      </button>
    </form>
  );
}
