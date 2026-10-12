/**
 * F4-C2: fan_since validation. Deliberately never constructs a `Date` from
 * the raw "YYYY-MM-DD" string for anything that affects the stored value
 * or the future-date comparison — both are done as plain string
 * operations (lexicographic comparison of zero-padded ISO date strings is
 * correct for this purpose). Only `getTodayLocalISODate()`'s own `Date`
 * use, and the calendar-validity check's multi-argument `Date` use below,
 * read back local (not UTC) components — this avoids the classic bug
 * where `new Date("2026-10-12")` (parsed as UTC midnight) then rendered
 * or compared via local-time methods shifts by a day depending on the
 * browser's timezone.
 */

const DATE_SHAPE = /^\d{4}-\d{2}-\d{2}$/;

export function getTodayLocalISODate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export type FanSinceResult = { value: string | null; error: string | null };

export function validateFanSince(raw: string): FanSinceResult {
  const trimmed = raw.trim();

  if (trimmed === "") {
    return { value: null, error: null };
  }

  if (!DATE_SHAPE.test(trimmed)) {
    return { value: null, error: "ファン歴の形式を確認してください。" };
  }

  const [year, month, day] = trimmed.split("-").map(Number);

  // The multi-argument Date constructor uses *local* time components on
  // both construction and read-back, so this round-trip never touches
  // UTC/timezone conversion — it only detects calendar-invalid input
  // (e.g. "2026-02-30", which JS would otherwise silently roll over to
  // March 2).
  const asDate = new Date(year, month - 1, day);
  const isValidCalendarDate =
    asDate.getFullYear() === year && asDate.getMonth() === month - 1 && asDate.getDate() === day;

  if (!isValidCalendarDate) {
    return { value: null, error: "ファン歴の日付が正しくありません。" };
  }

  // Plain string comparison of two zero-padded "YYYY-MM-DD" values is
  // lexicographically equivalent to date-order comparison — no Date
  // object (and therefore no timezone) is involved here.
  if (trimmed > getTodayLocalISODate()) {
    return { value: null, error: "ファン歴に未来の日付は指定できません。" };
  }

  return { value: trimmed, error: null };
}
