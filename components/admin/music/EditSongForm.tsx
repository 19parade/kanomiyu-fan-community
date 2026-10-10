"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";

const TITLE_MAX_LENGTH = 100; // UX hint only; internal.normalize_song_content() is authoritative.
const DESCRIPTION_MAX_LENGTH = 5000; // same.
const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // mirrors lib/song-images/validate.ts's MAX_SONG_IMAGE_BYTES; UX hint only.

type CoverActionValue = "keep" | "replace" | "remove";

/**
 * Maps PATCH /api/admin/music/[id]'s stable error codes (see
 * app/api/admin/music/[id]/route.ts and lib/song-images/errors.ts) to
 * Japanese messages. SONG_VERSION_CONFLICT is handled separately (dedicated
 * conflict UI, never shown as a generic message here). Only codes this
 * endpoint can actually return are listed.
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
  INVALID_SONG_VERSION: "保存情報が古くなっています。最新内容を読み込み直してください。",
  SONG_NOT_FOUND: "この楽曲は見つかりませんでした。一覧から再度お試しください。",
  INVALID_REQUEST: "入力内容を確認してください。",
  INVALID_SONG_STATUS: "公開状態の指定を確認してください。",
};
const GENERIC_ERROR_MESSAGE = "保存できませんでした。";

function statusLabel(status: string): string {
  if (status === "draft") return "下書き";
  if (status === "public") return "公開";
  return status;
}

type EditSongFormProps = {
  songId: string;
  initialTitle: string;
  initialReleaseDate: string | null;
  initialDescription: string | null;
  initialCoverImageKey: string | null;
  initialCoverImageUrl: string | null;
  initialStatus: string;
  initialUpdatedAt: string;
};

/**
 * Song edit form (A4). Submits to the existing
 * `PATCH /api/admin/music/[id]` (ST4, unchanged) using the exact multipart
 * field names that Route Handler reads (`expected_updated_at` / `title` /
 * `release_date` / `description` / `cover_action` / `file`) — confirmed
 * from app/api/admin/music/[id]/route.ts's source, not guessed. Never calls
 * Supabase or Storage directly from the browser.
 *
 * `cover_action`'s three values map to Japanese labels only — the string
 * "cover_action" itself is never shown to the admin. "画像を削除" is not
 * rendered at all when there is no current cover (nothing to remove).
 *
 * `versionToken` starts as `initialUpdatedAt` and is carried as an opaque
 * raw string end to end: never `new Date(...)`, never `.toISOString()`,
 * never reformatted. It is only ever replaced by the exact raw
 * `updated_at` string from a PATCH response.
 *
 * A5: publication status (draft/public) is changed via
 * `PATCH /api/admin/music/[id]/status` (new route, wraps the existing
 * set_song_status RPC unchanged). This control lives in the *same*
 * component as the content-edit form specifically so both operations share
 * one `versionToken`/`pending`/`conflict` state — the migration's own
 * contract says content edits and status changes share one updated_at
 * lineage, so two separately-held tokens in two different components could
 * each go stale without the other knowing. A window.confirm() gates the
 * actual request (no new UI library); status changes report success/
 * conflict/error through the exact same banners as a content save.
 */
export function EditSongForm({
  songId,
  initialTitle,
  initialReleaseDate,
  initialDescription,
  initialCoverImageKey,
  initialCoverImageUrl,
  initialStatus,
  initialUpdatedAt,
}: EditSongFormProps) {
  const router = useRouter();

  const [title, setTitle] = useState(initialTitle);
  const [releaseDate, setReleaseDate] = useState(initialReleaseDate ?? "");
  const [description, setDescription] = useState(initialDescription ?? "");
  const [coverAction, setCoverAction] = useState<CoverActionValue>("keep");
  const [newFile, setNewFile] = useState<File | null>(null);
  const [newFilePreviewUrl, setNewFilePreviewUrl] = useState<string | null>(null);
  const [coverLoadFailed, setCoverLoadFailed] = useState(false);

  // The version token this form will send as `expected_updated_at` on the
  // next save. Carried as-is from the server, never parsed/reformatted —
  // see the module doc comment above. Shared by both the content-edit save
  // and the A5 status change below — there is only ever one token in this
  // component, never two independently-tracked copies.
  const [versionToken, setVersionToken] = useState(initialUpdatedAt);
  // A5: current publication status, updated locally after a successful
  // status change (and, like versionToken, refreshed from the server via
  // the page's key-remount after a conflict reload).
  const [status, setStatus] = useState(initialStatus);

  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      if (newFilePreviewUrl) {
        URL.revokeObjectURL(newFilePreviewUrl);
      }
    };
  }, [newFilePreviewUrl]);

  function clearNewFile() {
    if (newFilePreviewUrl) {
      URL.revokeObjectURL(newFilePreviewUrl);
    }
    setNewFile(null);
    setNewFilePreviewUrl(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  function handleCoverActionChange(next: CoverActionValue) {
    setCoverAction(next);
    setError(null);
    if (next !== "replace") {
      clearNewFile();
    }
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0] ?? null;

    if (newFilePreviewUrl) {
      URL.revokeObjectURL(newFilePreviewUrl);
    }

    if (selected === null) {
      setNewFile(null);
      setNewFilePreviewUrl(null);
      return;
    }

    // UX-only checks — the server's magic-byte/size/MIME validation
    // (lib/song-images/validate.ts, via the existing PATCH route) remains
    // authoritative regardless of what passes here.
    if (!ACCEPTED_IMAGE_TYPES.includes(selected.type)) {
      setError(ERROR_MESSAGES.UNSUPPORTED_IMAGE_TYPE);
      setNewFile(null);
      setNewFilePreviewUrl(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    if (selected.size > MAX_IMAGE_BYTES) {
      setError(ERROR_MESSAGES.FILE_TOO_LARGE);
      setNewFile(null);
      setNewFilePreviewUrl(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    setError(null);
    setNewFile(selected);
    setNewFilePreviewUrl(URL.createObjectURL(selected));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (title.trim() === "") {
      setError(ERROR_MESSAGES.INVALID_SONG_TITLE);
      return;
    }
    if (coverAction === "replace" && newFile === null) {
      setError("差し替える画像ファイルを選択してください。");
      return;
    }

    setPending(true);
    setError(null);
    setConflict(false);
    setSuccessMessage(null);

    const formData = new FormData();
    // Raw string, exactly as received — never new Date(...), never
    // .toISOString(), never reformatted (A4's central requirement).
    formData.append("expected_updated_at", versionToken);
    formData.append("title", title);
    if (releaseDate !== "") {
      formData.append("release_date", releaseDate);
    }
    if (description !== "") {
      formData.append("description", description);
    }
    formData.append("cover_action", coverAction);
    if (coverAction === "replace" && newFile) {
      formData.append("file", newFile);
    }

    try {
      // Browser sets its own multipart boundary; Content-Type is never set
      // manually here (existing ST3-ST5 / A3 precedent).
      const response = await fetch(`/api/admin/music/${songId}`, { method: "PATCH", body: formData });
      const body = await response.json().catch(() => null);

      if (!response.ok) {
        const code = typeof body?.error === "string" ? body.error : null;

        if (code === "SONG_VERSION_CONFLICT") {
          // Never auto-overwrite, never auto-retry. The admin must
          // explicitly choose to reload (see the conflict UI below).
          setConflict(true);
          setPending(false);
          return;
        }

        setError((code && ERROR_MESSAGES[code]) ?? GENERIC_ERROR_MESSAGE);
        setPending(false);
        return;
      }

      const updated = body?.updated === true;
      const newUpdatedAt = typeof body?.updated_at === "string" ? body.updated_at : versionToken;

      // Immediately adopt the new version token so a save right after this
      // one does not spuriously conflict against the token we just used
      // (A4 §14) — this does not wait for router.refresh() below.
      setVersionToken(newUpdatedAt);
      setSuccessMessage(updated ? "保存しました。" : "変更はありません。");
      setPending(false);

      if (coverAction === "replace" || coverAction === "remove") {
        // The PATCH response never includes the new/cleared cover key (see
        // app/api/admin/music/[id]/route.ts) — the only way to learn the
        // post-save cover state is to re-fetch via the Server Component.
        // app/admin/music/[id]/page.tsx keys this component by
        // `song.updated_at`; since this save just changed that value on
        // the server, the refreshed render below will mount a fresh
        // instance with the correct new cover (or none, for "remove").
        router.refresh();
      } else {
        clearNewFile();
      }
    } catch (fetchError) {
      console.error("edit song form: request failed", fetchError);
      setError(GENERIC_ERROR_MESSAGE);
      setPending(false);
    }
  }

  async function handleStatusChange(nextStatus: "draft" | "public") {
    const confirmMessage =
      nextStatus === "public"
        ? "この楽曲を公開しますか？公開すると一般公開ページから閲覧できるようになります。"
        : "この楽曲を下書きに戻しますか？\n\n" +
          "下書きに戻すと、一般公開の一覧・詳細からは見えなくなります。ただし画像の保存先は" +
          "公開バケットのため、画像のURLを既に知っている場合やブラウザ等にキャッシュされている" +
          "場合、画像ファイル自体へのアクセスを完全に取り消せるわけではありません。";

    if (!window.confirm(confirmMessage)) {
      return;
    }

    setPending(true);
    setError(null);
    setConflict(false);
    setSuccessMessage(null);

    try {
      // JSON body (A5) — unlike the multipart content save above, there is
      // no file here, so setting Content-Type explicitly is correct (not
      // the "let the browser set the multipart boundary" case).
      const response = await fetch(`/api/admin/music/${songId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expected_updated_at: versionToken, target_status: nextStatus }),
      });
      const body = await response.json().catch(() => null);

      if (!response.ok) {
        const code = typeof body?.error === "string" ? body.error : null;

        if (code === "SONG_VERSION_CONFLICT") {
          setConflict(true);
          setPending(false);
          return;
        }

        setError((code && ERROR_MESSAGES[code]) ?? GENERIC_ERROR_MESSAGE);
        setPending(false);
        return;
      }

      const updated = body?.updated === true;
      const newUpdatedAt = typeof body?.updated_at === "string" ? body.updated_at : versionToken;
      const newStatus = typeof body?.status === "string" ? body.status : nextStatus;

      // The response already carries everything the UI needs (status and
      // the new token) — unlike a cover replace/remove, there is no hidden
      // server-only state to resync, so this updates local state directly
      // instead of going through router.refresh()/remount. That keeps any
      // in-progress, unsaved content edits in the other fields intact.
      setVersionToken(newUpdatedAt);
      setStatus(newStatus);
      setSuccessMessage(updated ? "公開状態を変更しました。" : "変更はありません。");
      setPending(false);
    } catch (fetchError) {
      console.error("edit song form: status change request failed", fetchError);
      setError(GENERIC_ERROR_MESSAGE);
      setPending(false);
    }
  }

  function handleReloadAfterConflict() {
    // Discards any unsaved local edits in this instance — disclosed in the
    // conflict message below. Causes app/admin/music/[id]/page.tsx to
    // re-fetch the song; since the real server-side updated_at differs
    // from what this instance was keyed with, React remounts
    // EditSongForm with the genuinely current title/release_date/
    // description/cover/version — not just a locally-patched guess.
    router.refresh();
  }

  const hasCurrentCover = initialCoverImageKey !== null;

  return (
    <div>
      <p>
        現在の公開状態: <strong>{statusLabel(status)}</strong>
      </p>

      <section>
        <h2>公開状態の操作</h2>
        {status === "draft" ? (
          <button type="button" disabled={pending} onClick={() => handleStatusChange("public")}>
            公開する
          </button>
        ) : (
          <button type="button" disabled={pending} onClick={() => handleStatusChange("draft")}>
            下書きに戻す
          </button>
        )}
      </section>

      <section>
        <h2>現在のカバー画像</h2>
        {initialCoverImageUrl && !coverLoadFailed ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={initialCoverImageUrl}
            alt="現在のカバー画像"
            width={160}
            height={160}
            onError={() => setCoverLoadFailed(true)}
          />
        ) : (
          <p>画像は設定されていません。</p>
        )}
      </section>

      <form onSubmit={handleSubmit}>
        <div>
          <label htmlFor="edit-song-title">タイトル</label>
          <br />
          <input
            id="edit-song-title"
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
          <label htmlFor="edit-song-release-date">発売日（任意）</label>
          <br />
          <input
            id="edit-song-release-date"
            name="release_date"
            type="date"
            value={releaseDate}
            disabled={pending}
            onChange={(event) => setReleaseDate(event.target.value)}
          />
        </div>

        <div>
          <label htmlFor="edit-song-description">説明文（任意）</label>
          <br />
          <textarea
            id="edit-song-description"
            name="description"
            maxLength={DESCRIPTION_MAX_LENGTH}
            value={description}
            disabled={pending}
            onChange={(event) => setDescription(event.target.value)}
          />
        </div>

        <fieldset disabled={pending}>
          <legend>カバー画像の操作</legend>
          <label>
            <input
              type="radio"
              name="cover-action-ui"
              value="keep"
              checked={coverAction === "keep"}
              onChange={() => handleCoverActionChange("keep")}
            />
            現在の画像を維持
          </label>
          <br />
          <label>
            <input
              type="radio"
              name="cover-action-ui"
              value="replace"
              checked={coverAction === "replace"}
              onChange={() => handleCoverActionChange("replace")}
            />
            画像を差し替える
          </label>
          {hasCurrentCover ? (
            <>
              <br />
              <label>
                <input
                  type="radio"
                  name="cover-action-ui"
                  value="remove"
                  checked={coverAction === "remove"}
                  onChange={() => handleCoverActionChange("remove")}
                />
                画像を削除
              </label>
            </>
          ) : null}

          {coverAction === "replace" ? (
            <div>
              <label htmlFor="edit-song-cover-file">
                新しい画像（JPEG・PNG・WebP、5MB以下）
              </label>
              <br />
              <input
                id="edit-song-cover-file"
                name="file"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                ref={fileInputRef}
                disabled={pending}
                onChange={handleFileChange}
              />
              {newFilePreviewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={newFilePreviewUrl}
                  alt="新しいカバー画像のプレビュー"
                  width={160}
                  height={160}
                />
              ) : null}
            </div>
          ) : null}
        </fieldset>

        {conflict ? (
          <div role="alert" aria-live="polite">
            <p>
              別の操作で更新されています。最新内容を読み込み直してください。
              （未保存の変更は失われます）
            </p>
            <button type="button" onClick={handleReloadAfterConflict}>
              最新内容を再読み込み
            </button>
          </div>
        ) : null}

        {error ? (
          <p role="alert" aria-live="polite">
            {error}
          </p>
        ) : null}

        {successMessage ? <p aria-live="polite">{successMessage}</p> : null}

        <button type="submit" disabled={pending}>
          {pending ? "保存中..." : "変更を保存"}
        </button>
      </form>
    </div>
  );
}
