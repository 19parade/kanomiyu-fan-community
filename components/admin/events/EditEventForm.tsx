"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { isoToJstDateTimeLocalValue, jstDateTimeLocalToIso } from "@/lib/events/format";

const TITLE_MAX_LENGTH = 100;
const VENUE_MAX_LENGTH = 100;
const DESCRIPTION_MAX_LENGTH = 5000;

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
  initialImageUrl: string | null;
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
 */
export function EditEventForm({
  eventId,
  initialTitle,
  initialVenue,
  initialEventDate,
  initialDoorsTime,
  initialStartTime,
  initialDescription,
  initialImageUrl,
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

  const [versionToken, setVersionToken] = useState(initialUpdatedAt);
  const [status, setStatus] = useState(initialStatus);
  const [firstPublishedAt, setFirstPublishedAt] = useState(initialFirstPublishedAt);

  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

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

    setPending(true);
    setError(null);
    setConflict(false);
    setSuccessMessage(null);

    try {
      const response = await fetch(`/api/admin/events/${eventId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expected_updated_at: versionToken,
          title,
          venue,
          event_date: eventDateIso,
          description: description !== "" ? description : null,
          // No upload UI yet — always resubmit the current key unchanged.
          image_url: initialImageUrl,
          ticket_url: ticketUrl !== "" ? ticketUrl : null,
          doors_time: jstDateTimeLocalToIso(doorsTime),
          start_time: jstDateTimeLocalToIso(startTime),
          official_url: officialUrl !== "" ? officialUrl : null,
        }),
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
      setVersionToken(newUpdatedAt);
      setSuccessMessage("保存しました。");
      setPending(false);
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
    <div>
      <p>
        現在の公開状態: <strong>{statusLabel(status)}</strong>
      </p>

      {conflict ? (
        <div role="alert" aria-live="polite">
          <p>
            他の変更と競合しました。この画面を開いている間に、別の場所で内容が更新された可能性があります。
            最新の内容を読み込み直してください（このフォームの未保存の変更は失われます）。
          </p>
          <button type="button" onClick={handleReloadAfterConflict}>
            最新の内容を読み込み直す
          </button>
        </div>
      ) : null}

      {successMessage && !conflict ? (
        <p role="status" aria-live="polite">
          {successMessage}
        </p>
      ) : null}

      {error && !conflict ? (
        <p role="alert" aria-live="polite">
          {error}
        </p>
      ) : null}

      <form onSubmit={handleSubmit}>
        <div>
          <label htmlFor="edit-event-title">タイトル</label>
          <br />
          <input
            id="edit-event-title"
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
          <label htmlFor="edit-event-venue">会場</label>
          <br />
          <input
            id="edit-event-venue"
            name="venue"
            type="text"
            required
            maxLength={VENUE_MAX_LENGTH}
            value={venue}
            disabled={pending}
            onChange={(event) => setVenue(event.target.value)}
          />
        </div>

        <div>
          <label htmlFor="edit-event-date">開催日時</label>
          <br />
          <input
            id="edit-event-date"
            name="event_date"
            type="datetime-local"
            required
            value={eventDate}
            disabled={pending}
            onChange={(event) => setEventDate(event.target.value)}
          />
        </div>

        <div>
          <label htmlFor="edit-event-doors-time">開場時刻（任意）</label>
          <br />
          <input
            id="edit-event-doors-time"
            name="doors_time"
            type="datetime-local"
            value={doorsTime}
            disabled={pending}
            onChange={(event) => setDoorsTime(event.target.value)}
          />
        </div>

        <div>
          <label htmlFor="edit-event-start-time">開演時刻（任意）</label>
          <br />
          <input
            id="edit-event-start-time"
            name="start_time"
            type="datetime-local"
            value={startTime}
            disabled={pending}
            onChange={(event) => setStartTime(event.target.value)}
          />
        </div>

        <div>
          <label htmlFor="edit-event-description">説明文（任意）</label>
          <br />
          <textarea
            id="edit-event-description"
            name="description"
            maxLength={DESCRIPTION_MAX_LENGTH}
            value={description}
            disabled={pending}
            onChange={(event) => setDescription(event.target.value)}
          />
        </div>

        <div>
          <label htmlFor="edit-event-official-url">公式情報リンク（任意）</label>
          <br />
          <input
            id="edit-event-official-url"
            name="official_url"
            type="url"
            placeholder="https://"
            value={officialUrl}
            disabled={pending}
            onChange={(event) => setOfficialUrl(event.target.value)}
          />
        </div>

        <div>
          <label htmlFor="edit-event-ticket-url">チケットリンク（任意）</label>
          <br />
          <input
            id="edit-event-ticket-url"
            name="ticket_url"
            type="url"
            placeholder="https://"
            value={ticketUrl}
            disabled={pending}
            onChange={(event) => setTicketUrl(event.target.value)}
          />
        </div>

        <button type="submit" disabled={pending}>
          {pending ? "保存中..." : "内容を保存"}
        </button>
      </form>

      <div>
        <p>公開状態の変更</p>
        {allowedStatusActions(status, firstPublishedAt).map((action) => (
          <button
            key={action.targetStatus}
            type="button"
            onClick={() => handleStatusChange(action)}
            disabled={pending}
          >
            {action.label}
          </button>
        ))}
      </div>
    </div>
  );
}
