/**
 * F5-D2: posts.content normalization/validation, shared logic the client
 * form uses before ever calling Supabase. Deliberately mirrors
 * supabase/migrations/20261012100000_posts_comments_content_length_check.sql's
 * posts_content_length_check CHECK constraint exactly — this is a
 * client-side convenience layer in front of that constraint, never a
 * replacement for it (the DB remains the final authority). Pattern and
 * rationale copied from lib/profile/bio.ts, which this migration's CHECK
 * itself was already modeled on.
 *
 * Unlike bio (nullable), posts.content is NOT NULL and a post can never be
 * "empty" — there is no normalize-to-null branch here; an empty or
 * whitespace-only result after normalization is simply a validation error.
 */

export const POST_CONTENT_MAX_LENGTH = 2000;

/**
 * F5-D3: mirrors
 * supabase/migrations/20261012100000_posts_comments_content_length_check.sql's
 * comments_content_length_check CHECK constraint (same forbidden-character
 * set and normalization as posts.content, different max length).
 */
export const COMMENT_CONTENT_MAX_LENGTH = 500;

// Matches posts_content_length_check's forbidden-character set exactly:
// ASCII control characters other than LF (U+000A), and DEL (U+007F). TAB is
// converted to a space and CR is converted to LF by normalizeContent()
// below *before* this is ever checked, so neither should actually appear
// here — this regex is the same final-defense check the DB applies, kept
// in sync deliberately rather than trusted blindly.
const FORBIDDEN_CONTENT_CHARS = /[\u0001-\u0009\u000B-\u001F\u007F]/;

/**
 * Normalizes raw textarea input:
 *   - CRLF and lone CR are converted to LF (so only LF ever represents a
 *     line break in stored data).
 *   - TAB is converted to a single half-width space.
 *   - Leading/trailing half-width (U+0020) and full-width (U+3000) spaces
 *     are removed (internal spaces/newlines are untouched).
 */
export function normalizeContent(raw: string): string {
  let value = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  value = value.replace(/\t/g, " ");
  value = value.replace(/^[ 　]+|[ 　]+$/g, "");
  return value;
}

/**
 * Unicode code-point count (not JS string `.length`, which counts UTF-16
 * code units and overcounts astral characters such as most emoji) —
 * matches PostgreSQL's char_length(), same reasoning as
 * lib/profile/bio.ts's countBioCodePoints().
 */
export function countContentCodePoints(normalized: string): number {
  return Array.from(normalized).length;
}

/**
 * Validates an already-normalized value against the given max length.
 * Returns an error message, or `null` when valid. Callers must run
 * normalizeContent() first — this does not itself normalize.
 */
export function validateNormalizedContent(normalized: string, maxLength: number): string | null {
  const length = countContentCodePoints(normalized);

  if (length < 1) {
    return "本文を入力してください。";
  }
  if (length > maxLength) {
    return `本文は${maxLength}文字以内で入力してください（現在${length}文字）。`;
  }
  if (FORBIDDEN_CONTENT_CHARS.test(normalized)) {
    return "本文に使用できない文字が含まれています。";
  }

  return null;
}
