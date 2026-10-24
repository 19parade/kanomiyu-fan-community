/**
 * Shared日本時間(JST) formatting for events.event_date / doors_time /
 * start_time (all `timestamptz`, stored as UTC instants). Every caller
 * explicitly pins `timeZone: "Asia/Tokyo"` so the displayed wall-clock time
 * is JST regardless of the server's own runtime timezone (unlike the
 * existing components/admin/music/MusicAdminList.tsx's formatUpdatedAt(),
 * which leaves the timezone unspecified — that function is left unchanged;
 * this is a new, LIVE機能-specific formatter with an explicit timezone per
 * PM方針 2026-10-24).
 */
export function formatEventDateTime(value: string | null): string | null {
  if (!value) {
    return null;
  }
  try {
    return new Intl.DateTimeFormat("ja-JP", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Asia/Tokyo",
    }).format(new Date(value));
  } catch {
    // Never let a formatting quirk crash the page — fall back to the raw value.
    return value;
  }
}

/**
 * Converts a `timestamptz` ISO string to the value a `<input
 * type="datetime-local">` needs ("YYYY-MM-DDTHH:mm"), expressed as JST wall
 * clock time regardless of the browser's own timezone — pairs with
 * `jstDateTimeLocalToIso` below for a lossless round trip through the admin
 * event forms.
 */
export function isoToJstDateTimeLocalValue(value: string | null): string {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const map: Record<string, string> = {};
  for (const part of parts) {
    map[part.type] = part.value;
  }
  return `${map.year}-${map.month}-${map.day}T${map.hour}:${map.minute}`;
}

/**
 * Converts a `<input type="datetime-local">` value ("YYYY-MM-DDTHH:mm", no
 * timezone) to a UTC ISO string, treating the input as JST explicitly (fixed
 * UTC+9 offset, no DST) — never relies on the browser's own local timezone
 * setting (PM方針 2026-10-24「日本時間を基本とする」). Returns null for an
 * empty or unparseable value, so callers can send "not set" as null.
 */
export function jstDateTimeLocalToIso(value: string): string | null {
  if (value === "") {
    return null;
  }
  const date = new Date(`${value}:00+09:00`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
