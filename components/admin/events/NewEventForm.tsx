"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { buttonClassName } from "@/components/ui/Button";
import { jstDateTimeLocalToIso } from "@/lib/events/format";

const INPUT_CLASS =
  "mt-1 w-full rounded-xl border border-border bg-background px-4 py-3 text-base text-foreground placeholder:text-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-50";

const TITLE_MAX_LENGTH = 100; // UX hint only; internal.normalize_event_content() is authoritative.
const VENUE_MAX_LENGTH = 100; // same.
const DESCRIPTION_MAX_LENGTH = 5000; // same.

/**
 * Maps POST /api/admin/events's stable error codes (see
 * app/api/admin/events/route.ts and lib/events/errors.ts) to Japanese
 * messages. Only codes this endpoint can actually return are listed.
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
};
const GENERIC_ERROR_MESSAGE = "保存できませんでした。";

/**
 * New LIVE creation form (LIVE機能 Phase 1). Submits JSON to
 * `POST /api/admin/events`. Always creates a draft — there is no status
 * control here (create_event's own contract). No key-visual upload field:
 * the `event-images` Storage bucket does not exist yet, so `image_url` is
 * always sent as null (see app/api/admin/events/route.ts's doc comment).
 */
export function NewEventForm() {
  const router = useRouter();

  const [title, setTitle] = useState("");
  const [venue, setVenue] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [doorsTime, setDoorsTime] = useState("");
  const [startTime, setStartTime] = useState("");
  const [description, setDescription] = useState("");
  const [officialUrl, setOfficialUrl] = useState("");
  const [ticketUrl, setTicketUrl] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

    try {
      const response = await fetch("/api/admin/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          venue,
          event_date: eventDateIso,
          description: description !== "" ? description : null,
          ticket_url: ticketUrl !== "" ? ticketUrl : null,
          doors_time: jstDateTimeLocalToIso(doorsTime),
          start_time: jstDateTimeLocalToIso(startTime),
          official_url: officialUrl !== "" ? officialUrl : null,
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
      router.push(newId ? `/admin/events/${newId}` : "/admin/events");
    } catch (fetchError) {
      console.error("new event form: request failed", fetchError);
      setError(GENERIC_ERROR_MESSAGE);
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <div>
        <label htmlFor="new-event-title" className="block text-sm font-bold">
          タイトル
        </label>
        <input
          id="new-event-title"
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
        <label htmlFor="new-event-venue" className="block text-sm font-bold">
          会場
        </label>
        <input
          id="new-event-venue"
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
        <label htmlFor="new-event-date" className="block text-sm font-bold">
          開催日時
        </label>
        <input
          id="new-event-date"
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
        <label htmlFor="new-event-doors-time" className="block text-sm font-bold">
          開場時刻（任意）
        </label>
        <input
          id="new-event-doors-time"
          name="doors_time"
          type="datetime-local"
          value={doorsTime}
          disabled={pending}
          onChange={(event) => setDoorsTime(event.target.value)}
          className={INPUT_CLASS}
        />
      </div>

      <div>
        <label htmlFor="new-event-start-time" className="block text-sm font-bold">
          開演時刻（任意）
        </label>
        <input
          id="new-event-start-time"
          name="start_time"
          type="datetime-local"
          value={startTime}
          disabled={pending}
          onChange={(event) => setStartTime(event.target.value)}
          className={INPUT_CLASS}
        />
      </div>

      <div>
        <label htmlFor="new-event-description" className="block text-sm font-bold">
          説明文（任意）
        </label>
        <textarea
          id="new-event-description"
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
        <label htmlFor="new-event-official-url" className="block text-sm font-bold">
          公式情報リンク（任意）
        </label>
        <input
          id="new-event-official-url"
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
        <label htmlFor="new-event-ticket-url" className="block text-sm font-bold">
          チケットリンク（任意）
        </label>
        <input
          id="new-event-ticket-url"
          name="ticket_url"
          type="url"
          placeholder="https://"
          value={ticketUrl}
          disabled={pending}
          onChange={(event) => setTicketUrl(event.target.value)}
          className={INPUT_CLASS}
        />
      </div>

      {error ? (
        <p role="alert" aria-live="polite" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
          {error}
        </p>
      ) : null}

      <button type="submit" disabled={pending} className={buttonClassName("primary", "w-full")}>
        {pending ? "保存中..." : "下書きとして保存"}
      </button>
    </form>
  );
}
