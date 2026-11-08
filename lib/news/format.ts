/**
 * Shared日本時間(JST) formatting for news.published_at (`timestamptz`,
 * stored as UTC instant). Mirrors lib/events/format.ts's approach (explicit
 * `timeZone: "Asia/Tokyo"`, fixed UTC+9 offset for the reverse conversion —
 * no DST), but date-only: the PM spec displays news dates as "YYYY.MM.DD"
 * with no time component, and the admin form collects only a date
 * (`<input type="date">`), never a time of day.
 */

/**
 * Formats a `published_at` ISO string as "YYYY.MM.DD" (PM spec's exact
 * display format for WHAT'S NEW), in JST regardless of the server's own
 * runtime timezone.
 */
export function formatNewsDate(value: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Tokyo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date(value));
    const map: Record<string, string> = {};
    for (const part of parts) {
      map[part.type] = part.value;
    }
    return `${map.year}.${map.month}.${map.day}`;
  } catch {
    // Never let a formatting quirk crash the page — fall back to the raw value.
    return value;
  }
}

/**
 * Converts a `published_at` ISO string to the value a `<input type="date">`
 * needs ("YYYY-MM-DD"), expressed as JST wall-clock date — pairs with
 * `jstDateToIso` below for a lossless round trip through the admin news
 * forms.
 */
export function isoToJstDateValue(value: string | null): string {
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
  }).formatToParts(date);
  const map: Record<string, string> = {};
  for (const part of parts) {
    map[part.type] = part.value;
  }
  return `${map.year}-${map.month}-${map.day}`;
}

/**
 * Converts a `<input type="date">` value ("YYYY-MM-DD") to a UTC ISO
 * string representing JST midnight (00:00 JST) of that date — treating the
 * input as JST explicitly (fixed UTC+9 offset, no DST), never the browser's
 * own local timezone. Returns null for an empty or unparseable value.
 */
export function jstDateToIso(value: string): string | null {
  if (value === "") {
    return null;
  }
  const date = new Date(`${value}T00:00:00+09:00`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
