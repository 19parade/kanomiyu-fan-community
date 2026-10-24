"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";

import { EventImage } from "@/components/live/EventImage";
import { buttonClassName } from "@/components/ui/Button";
import { isoToJstDateTimeLocalValue, jstDateTimeLocalToIso } from "@/lib/events/format";

const INPUT_CLASS =
  "mt-1 w-full rounded-xl border border-border bg-background px-4 py-3 text-base text-foreground placeholder:text-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-50";

const TITLE_MAX_LENGTH = 100;
const VENUE_MAX_LENGTH = 100;
const DESCRIPTION_MAX_LENGTH = 5000;
const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // mirrors lib/event-images/validate.ts's MAX_EVENT_IMAGE_BYTES; UX hint only.

type CoverActionValue = "keep" | "replace" | "remove";

/**
 * Maps PATCH /api/admin/events/[id] and .../status's stable error codes
 * (see lib/events/errors.ts) to Japanese messages. EVENT_CONFLICT is handled
 * separately (dedicated conflict UI, never shown as a generic message here).
 */
const ERROR_MESSAGES: Record<string, string> = {
  INVALID_EVENT_TITLE: "タイトルを確認してください（1〜100文字で入力してください）。",
  INVALID_EVENT_VENUE: "会場を確認してください（1〜100文字で入力してください）。",
  INVALID_EVENT_DATE: "開催日時を確認してください。",
  INVALID_EVENT_DESCRIPTION: "説明文を確認してください（5000文字以内で入力してください）。",
  INVALID_EVENT_TICKET_URL: "チケットリンクを確認してください（https:// で始まるURLを入力してください）。",
  INVALID_EVENT_DOORS_TIME: "開場時刻を確認してください。",
  INVALID_EVENT_START_TIME: "開演時刻を確認してください。",
  INVALID_EVENT_OFFICIAL_URL: "公式情報リンクを確認してください（https:// で始まるURLを入力してください）。",
  INVALID_EVENT_IMAGE_KEY: "キービジュアル画像の処理中にエラーが発生しました。もう一度お試しください。",
  INVALID_UPLOAD: "画像ファイルを確認してください。",
  FILE_TOO_LARGE: "画像ファイルは5MB以下にしてください。",
  UNSUPPORTED_IMAGE_TYPE: "対応していない画像形式です（JPEG・PNG・WebPのみ利用できます）。",
  IMAGE_TYPE_MISMATCH: "画像ファイルの内容と拡張子が一致しません。",
  UPLOAD_FAILED: "画像のアップロードに失敗しました。もう一度お試しください。",
  UNAUTHORIZED: "ログインが必要です。再度ログインしてください。",
  FORBIDDEN: "この操作を行う権限がありません。",
  ORIGIN_INVALID: "リクエストを処理できませんでした。ページを再読み込みしてからお試しください。",
  INVALID_EVENT_VERSION: "保存情報が古くなっています。最新内容を読み込み直してください。",
  EVENT_NOT_FOUND: "このLIVEは見つかりませんでした。一覧から再度お試しください。",
  INVALID_REQUEST: "入力内容を確認してください。",
  INVALID_EVENT_STATUS: "公開状態の指定を確認してください。",
  INVALID_EVENT_TRANSITION: "この状態には変更できません。",
};
const GENERIC_ERROR_MESSAGE = "保存できませんでした。";

function statusLabel(status: string): string {
  if (status === "draft") return "下書き";
  if (status === "public") return "公開中";
  if (status === "cancelled") return "中止";
  return status;
}

type StatusAction = {
  targetStatus: "draft" | "public" | "cancelled";
  label: string;
  confirmMessage: string;
};

/**
 * Returns the status transitions currently allowed from (status,
 * firstPublishedAt), per the fixed table set_event_status() enforces
 * (PROJECT_SPEC.md 6.5「status変更」M17 — not duplicated here beyond this UI
 * convenience; the RPC remains the real enforcement).
 */
function allowedStatusActions(status: string, firstPublishedAt: string | null): StatusAction[] {
  if (status === "draft") {
    return [
      {
        targetStatus: "public",
        label: "公開する",
        confirmMessage: "このLIVEを公開しますか？公開すると一般公開ページから閲覧できるようになります。",
      },
      {
        targetStatus: "cancelled",
        label: "公開せずに破棄する",
        confirmMessage: "このLIVEを公開せずに破棄しますか？この操作は取り消せません（下書きには戻せません）。",
      },
    ];
  }
  if (status === "public") {
    return [
      {
        targetStatus: "cancelled",
        label: "開催を中止する",
        confirmMessage:
          "このLIVEを中止しますか？中止後もLIVE情報は公開され続け、「開催中止」と表示されます。",
      },
    ];
  }
  if (status === "cancelled") {
    if (firstPublishedAt === null) {
      return [
        {
          targetStatus: "draft",
          label: "下書きに戻す",
          confirmMessage: "このLIVEを下書きに戻しますか？",
        },
      ];
    }
    return [
      {
        targetStatus: "public",
        label: "中止を取り消して再公開する",
        confirmMessage: "中止を取り消してこのLIVEを再公開しますか？",
      },
    ];
  }
  return [];
}

type EditEventFormProps = {
  eventId: string;
  initialTitle: string;
  initialVenue: string;
  initialEventDate: string;
  initialDoorsTime: string | null;
  initialStartTime: string | null;
  initialDescription: string | null;
  initialImageKey: string | null;
  initialImageDisplayUrl: string | null;
  initialTicketUrl: string | null;
  initialOfficialUrl: string | null;
  initialStatus: string;
  initialFirstPublishedAt: string | null;
  initialUpdatedAt: string;
};

/**
 * Event edit form (LIVE機能 Phase 1), mirroring
 * components/admin/music/EditSongForm.tsx's structure (content save +
 * status change sharing one `versionToken`, 409-conflict UI, no
 * auto-overwrite/auto-retry). No image upload here (no Storage bucket yet —
 * `initialImageUrl` is only resubmitted unchanged on every content save, see
 * app/api/admin/events/[id]/route.ts's doc comment).
 *
 * `versionToken` is carried as the exact raw `updated_at` string end to
 * end — never `new Date(...)`, never reformatted.
 *
 * LIVE機能 Phase 4-A: key-visual image management (`cover_action`) mirrors
 * components/admin/music/EditSongForm.tsx exactly — "keep" resubmits
 * `initialImageKey` unchanged, "replace" requires a file, "remove" clears it.
 * The route handler (app/api/admin/events/[id]/route.ts) owns the actual
 * Storage upload/delete; this component only ever sends the chosen file and
 * action, never a Storage key it invented itself.
 */
export function EditEventForm({
  eventId,
  initialTitle,
  initialVenue,
  initialEventDate,
  initialDoorsTime,
  initialStartTime,
  initialDescription,
  initialImageKey,
  initialImageDisplayUrl,
  initialTicketUrl,
  initialOfficialUrl,
  initialStatus,
  initialFirstPublishedAt,
  initialUpdatedAt,
}: EditEventFormProps) {
  const router = useRouter();

  const [title, setTitle] = useState(initialTitle);
  const [venue, setVenue] = useState(initialVenue);
  const [eventDate, setEventDate] = useState(isoToJstDateTimeLocalValue(initialEventDate));
  const [doorsTime, setDoorsTime] = useState(isoToJstDateTimeLocalValue(initialDoorsTime));
  const [startTime, setStartTime] = useState(isoToJstDateTimeLocalValue(initialStartTime));
  const [description, setDescription] = useState(initialDescription ?? "");
  const [officialUrl, setOfficialUrl] = useState(initialOfficialUrl ?? "");
  const [ticketUrl, setTicketUrl] = useState(initialTicketUrl ?? "");

  const [coverAction, setCoverAction] = useState<CoverActionValue>("keep");
  const [newFile, setNewFile] = useState<File | null>(null);
  const [newFilePreviewUrl, setNewFilePreviewUrl] = useState<string | null>(null);
  const hasCurrentCover = initialImageKey !== null;
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [versionToken, setVersionToken] = useState(initialUpdatedAt);
  const [status, setStatus] = useState(initialStatus);
  const [firstPublishedAt, setFirstPublishedAt] = useState(initialFirstPublishedAt);

  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

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
    // (lib/event-images/validate.ts, via the existing PATCH route) remains
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
      setError(ERROR_MESSAGES.INVALID_EVENT_TITLE);
      return;
    }
    if (venue.trim() === "") {
      setError(ERROR_MESSAGES.INVALID_EVENT_VENUE);
      return;
    }
    const eventDateIso = jstDateTimeLocalToIso(eventDate);
    if (!eventDateIso) {
      setError(ERROR_MESSAGES.INVALID_EVENT_DATE);
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
    // .toISOString(), never reformatted.
    formData.append("expected_updated_at", versionToken);
    formData.append("title", title);
    formData.append("venue", venue);
    formData.append("event_date", eventDateIso);
    if (description !== "") {
      formData.append("description", description);
    }
    const doorsTimeIso = jstDateTimeLocalToIso(doorsTime);
    if (doorsTimeIso) {
      formData.append("doors_time", doorsTimeIso);
    }
    const startTimeIso = jstDateTimeLocalToIso(startTime);
    if (startTimeIso) {
      formData.append("start_time", startTimeIso);
    }
    if (ticketUrl !== "") {
      formData.append("ticket_url", ticketUrl);
    }
    if (officialUrl !== "") {
      formData.append("official_url", officialUrl);
    }
    formData.append("cover_action", coverAction);
    if (coverAction === "replace" && newFile) {
      formData.append("file", newFile);
    }

    try {
      // Browser sets its own multipart boundary; Content-Type is never set
      // manually here (existing music admin route precedent).
      const response = await fetch(`/api/admin/events/${eventId}`, { method: "PATCH", body: formData });
      const body = await response.json().catch(() => null);

      if (!response.ok) {
        const code = typeof body?.error === "string" ? body.error : null;

        if (code === "EVENT_CONFLICT") {
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

      if (coverAction === "replace" || coverAction === "remove") {
        // The PATCH response's image_url reflects the new state, but the
        // display URL must be re-resolved server-side (Storage getPublicUrl)
        // — app/admin/events/[id]/page.tsx keys this component by
        // `event.updated_at`, since this save just changed that value on the
        // server, the refreshed render below will mount a fresh instance
        // with the correct new image (or none, for "remove").
        router.refresh();
      }
    } catch (fetchError) {
      console.error("edit event form: request failed", fetchError);
      setError(GENERIC_ERROR_MESSAGE);
      setPending(false);
    }
  }

  async function handleStatusChange(action: StatusAction) {
    if (!window.confirm(action.confirmMessage)) {
      return;
    }

    setPending(true);
    setError(null);
    setConflict(false);
    setSuccessMessage(null);

    try {
      const response = await fetch(`/api/admin/events/${eventId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expected_updated_at: versionToken, new_status: action.targetStatus }),
      });
      const body = await response.json().catch(() => null);

      if (!response.ok) {
        const code = typeof body?.error === "string" ? body.error : null;

        if (code === "EVENT_CONFLICT") {
          setConflict(true);
          setPending(false);
          return;
        }

        setError((code && ERROR_MESSAGES[code]) ?? GENERIC_ERROR_MESSAGE);
        setPending(false);
        return;
      }

      const newUpdatedAt = typeof body?.updated_at === "string" ? body.updated_at : versionToken;
      const newStatus = typeof body?.status === "string" ? body.status : action.targetStatus;

      setVersionToken(newUpdatedAt);
      setStatus(newStatus);
      // first_published_at only ever transitions null -> non-null, and only
      // on a draft -> public move (events_guard_publish_state trigger) — a
      // successful "公開する" action from draft always sets it; every other
      // transition leaves it as it already was.
      if (action.targetStatus === "public" && firstPublishedAt === null) {
        setFirstPublishedAt(newUpdatedAt);
      }
      setSuccessMessage("公開状態を変更しました。");
      setPending(false);
    } catch (fetchError) {
      console.error("edit event form: status change request failed", fetchError);
      setError(GENERIC_ERROR_MESSAGE);
      setPending(false);
    }
  }

  function handleReloadAfterConflict() {
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-muted">
        現在の公開状態: <strong className="text-foreground">{statusLabel(status)}</strong>
      </p>

      {conflict ? (
        <div role="alert" aria-live="polite" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
          <p>
            他の変更と競合しました。この画面を開いている間に、別の場所で内容が更新された可能性があります。
            最新の内容を読み込み直してください（このフォームの未保存の変更は失われます）。
          </p>
          <button type="button" onClick={handleReloadAfterConflict} className={buttonClassName("secondary", "mt-2")}>
            最新の内容を読み込み直す
          </button>
        </div>
      ) : null}

      {successMessage && !conflict ? (
        <p role="status" aria-live="polite" className="text-sm text-brand">
          {successMessage}
        </p>
      ) : null}

      {error && !conflict ? (
        <p role="alert" aria-live="polite" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
          {error}
        </p>
      ) : null}

      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <div>
          <label htmlFor="edit-event-title" className="block text-sm font-bold">
            タイトル
          </label>
          <input
            id="edit-event-title"
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
          <label htmlFor="edit-event-venue" className="block text-sm font-bold">
            会場
          </label>
          <input
            id="edit-event-venue"
            name="venue"
            type="text"
            required
            maxLength={VENUE_MAX_LENGTH}
            value={venue}
            disabled={pending}
            onChange={(event) => setVenue(event.target.value)}
            className={INPUT_CLASS}
          />
        </div>

        <div>
          <label htmlFor="edit-event-date" className="block text-sm font-bold">
            開催日時
          </label>
          <input
            id="edit-event-date"
            name="event_date"
            type="datetime-local"
            required
            value={eventDate}
            disabled={pending}
            onChange={(event) => setEventDate(event.target.value)}
            className={INPUT_CLASS}
          />
        </div>

        <div>
          <label htmlFor="edit-event-doors-time" className="block text-sm font-bold">
            開場時刻（任意）
          </label>
          <input
            id="edit-event-doors-time"
            name="doors_time"
            type="datetime-local"
            value={doorsTime}
            disabled={pending}
            onChange={(event) => setDoorsTime(event.target.value)}
            className={INPUT_CLASS}
          />
        </div>

        <div>
          <label htmlFor="edit-event-start-time" className="block text-sm font-bold">
            開演時刻（任意）
          </label>
          <input
            id="edit-event-start-time"
            name="start_time"
            type="datetime-local"
            value={startTime}
            disabled={pending}
            onChange={(event) => setStartTime(event.target.value)}
            className={INPUT_CLASS}
          />
        </div>

        <div>
          <label htmlFor="edit-event-description" className="block text-sm font-bold">
            説明文（任意）
          </label>
          <textarea
            id="edit-event-description"
            name="description"
            rows={5}
            maxLength={DESCRIPTION_MAX_LENGTH}
            value={description}
            disabled={pending}
            onChange={(event) => setDescription(event.target.value)}
            className={INPUT_CLASS}
          />
        </div>

        <div>
          <label htmlFor="edit-event-official-url" className="block text-sm font-bold">
            公式情報リンク（任意）
          </label>
          <input
            id="edit-event-official-url"
            name="official_url"
            type="url"
            placeholder="https://"
            value={officialUrl}
            disabled={pending}
            onChange={(event) => setOfficialUrl(event.target.value)}
            className={INPUT_CLASS}
          />
        </div>

        <div>
          <label htmlFor="edit-event-ticket-url" className="block text-sm font-bold">
            チケットリンク（任意）
          </label>
          <input
            id="edit-event-ticket-url"
            name="ticket_url"
            type="url"
            placeholder="https://"
            value={ticketUrl}
            disabled={pending}
            onChange={(event) => setTicketUrl(event.target.value)}
            className={INPUT_CLASS}
          />
        </div>

        <fieldset disabled={pending} className="rounded-xl border border-border p-4">
          <legend className="px-1 text-sm font-bold">キービジュアル画像</legend>
          <p className="text-sm text-muted">
            アップロードする画像は、ご自身が著作権を持つもの、または著作権者・公式から使用許諾を得たものに限ります。第三者の権利を侵害する画像はアップロードしないでください。
          </p>

          {hasCurrentCover ? (
            <div className="mt-3">
              <p className="text-sm font-bold">現在の画像</p>
              <div style={{ width: 160, height: 90 }} className="mt-1 overflow-hidden rounded-xl border border-border">
                <EventImage src={initialImageDisplayUrl} alt="現在のキービジュアル" />
              </div>
            </div>
          ) : (
            <p className="mt-3 text-sm text-muted">現在、画像は登録されていません。</p>
          )}

          <div className="mt-3 flex flex-col gap-2">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="cover-action-ui"
                value="keep"
                checked={coverAction === "keep"}
                onChange={() => handleCoverActionChange("keep")}
              />
              現在の画像を維持
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="cover-action-ui"
                value="replace"
                checked={coverAction === "replace"}
                onChange={() => handleCoverActionChange("replace")}
              />
              画像を{hasCurrentCover ? "差し替える" : "登録する"}
            </label>
            {hasCurrentCover ? (
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="cover-action-ui"
                  value="remove"
                  checked={coverAction === "remove"}
                  onChange={() => handleCoverActionChange("remove")}
                />
                画像を削除
              </label>
            ) : null}
          </div>

          {coverAction === "replace" ? (
            <div className="mt-3">
              <label htmlFor="edit-event-image-file" className="block text-sm font-bold">
                新しい画像（JPEG・PNG・WebP、5MB以下）
              </label>
              <input
                id="edit-event-image-file"
                name="file"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                ref={fileInputRef}
                disabled={pending}
                onChange={handleFileChange}
                className="mt-1 block w-full text-sm text-foreground file:mr-3 file:rounded-full file:border-0 file:bg-brand file:px-4 file:py-2 file:text-sm file:font-bold file:text-brand-foreground"
              />
              {newFilePreviewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={newFilePreviewUrl}
                  alt="新しいキービジュアルのプレビュー"
                  width={160}
                  height={90}
                  className="mt-2 rounded-xl border border-border object-cover"
                />
              ) : null}
            </div>
          ) : null}
        </fieldset>

        <button type="submit" disabled={pending} className={buttonClassName("primary", "w-full")}>
          {pending ? "保存中..." : "内容を保存"}
        </button>
      </form>

      <div>
        <p className="text-sm font-bold">公開状態の変更</p>
        <div className="mt-2 flex flex-wrap gap-3">
          {allowedStatusActions(status, firstPublishedAt).map((action) => (
            <button
              key={action.targetStatus}
              type="button"
              onClick={() => handleStatusChange(action)}
              disabled={pending}
              className={buttonClassName("secondary")}
            >
              {action.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
