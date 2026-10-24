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
 * string already carries unambiguous instant information.
 *
 * Bug fix (2026-10-24, found via a real post on production): this used to
 * read the instant back out with `Date.prototype.getFullYear()` /
 * `getHours()` etc., which return values in the *server's own runtime
 * timezone* (UTC on Vercel), not the viewer's — every post/comment
 * timestamp rendered 9 hours behind actual Japan time. Fixed the same way
 * lib/events/format.ts's formatEventDateTime() already does: pin
 * `timeZone: "Asia/Tokyo"` explicitly via Intl.DateTimeFormat so the
 * displayed wall-clock time is JST regardless of where this renders.
 */
export function formatPostDate(value: string): string {
  try {
    return new Intl.DateTimeFormat("ja-JP", {
      dateStyle: "long",
      timeStyle: "short",
      timeZone: "Asia/Tokyo",
    }).format(new Date(value));
  } catch {
    // Never let a formatting quirk crash the page — fall back to the raw value.
    return value;
  }
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
