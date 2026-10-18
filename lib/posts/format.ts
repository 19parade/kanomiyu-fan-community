/**
 * F5-D1: display formatting helpers shared by the feed list and detail
 * pages.
 */

/**
 * F5-D1b §3 case A: shown when get_public_profiles_by_ids() succeeded but
 * returned no row for this specific author_id. Deliberately does not say
 * "退会済み" (withdrawn) — a missing row here is indistinguishable by
 * design among banned, bidirectionally blocked (relative to the current
 * viewer), or genuinely nonexistent, and asserting "withdrawn" specifically
 * would be guessing at one cause among several.
 */
export const UNAVAILABLE_AUTHOR_LABEL = "（会員情報を表示できません）";

/**
 * posts.created_at / comments.created_at are `timestamptz`, serialized as
 * a full ISO 8601 string with an explicit offset — unlike
 * components/fans/FansList.tsx's formatFanSince() (a bare `date` with no
 * time/offset, which that function deliberately never round-trips through
 * `new Date()` to avoid a UTC/local off-by-one-day bug), a timestamptz
 * string already carries unambiguous instant information, so
 * `new Date(value)` here is safe and simply renders in the viewer's local
 * timezone.
 */
export function formatPostDate(value: string): string {
  const date = new Date(value);
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}年${month}月${day}日 ${hours}:${minutes}`;
}

/**
 * Truncates post content for list-view display. Uses Array.from(...) for
 * Unicode code-point-safe slicing (same reasoning as
 * lib/profile/bio.ts's countBioCodePoints() — plain string slicing could
 * split a surrogate pair such as an emoji in half).
 */
export function excerptContent(content: string, maxLength: number): string {
  const chars = Array.from(content);
  if (chars.length <= maxLength) {
    return content;
  }
  return `${chars.slice(0, maxLength).join("")}…`;
}
