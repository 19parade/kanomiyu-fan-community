/**
 * F4-C2: bio normalization/validation, shared logic the client form uses
 * before ever calling Supabase. Deliberately mirrors
 * supabase/migrations/20261012090000_profiles_bio_length_check.sql's
 * profiles_bio_check CHECK constraint exactly — this is a client-side
 * convenience layer in front of that constraint, never a replacement for
 * it (the DB remains the final authority; see ProfileEditForm.tsx's error
 * handling for the `23514` check-violation fallback).
 *
 * Character counting uses Array.from(...).length (Unicode code points),
 * matching PostgreSQL's char_length() — NOT the JS string `.length`
 * (UTF-16 code units), which overcounts astral characters such as most
 * emoji (surrogate pairs). Using `.length` here would show a user typing
 * emoji an inflated, DB-inconsistent character count.
 */

const MAX_BIO_LENGTH = 300;

// Matches profiles_bio_check's forbidden-character set exactly: ASCII
// control characters other than LF (U+000A), and DEL (U+007F). TAB is
// converted to a space and CR is converted to LF by normalizeBio() below
// *before* this is ever checked, so neither should actually appear here —
// this regex is the same final-defense check the DB applies, kept in sync
// deliberately rather than trusted blindly.
const FORBIDDEN_BIO_CHARS = /[\u0001-\u0009\u000B-\u001F\u007F]/;

/**
 * Normalizes raw textarea input into either `null` (nothing to store) or a
 * string ready for the length/character validation below.
 *   - CRLF and lone CR are converted to LF (so only LF ever represents a
 *     line break in stored data).
 *   - TAB is converted to a single half-width space.
 *   - Leading/trailing half-width (U+0020) and full-width (U+3000) spaces
 *     are removed (internal spaces are untouched).
 *   - An empty result after the above is treated as "no bio" (null), not
 *     an empty string — the DB's own CHECK constraint already requires
 *     char_length between 1 and 300 for a non-null value, so an empty
 *     string could never be stored validly anyway; normalizing it to null
 *     here keeps "no bio" as a single, unambiguous state.
 */
export function normalizeBio(raw: string): string | null {
  let value = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  value = value.replace(/\t/g, " ");
  value = value.replace(/^[ 　]+|[ 　]+$/g, "");
  return value.length === 0 ? null : value;
}

export function countBioCodePoints(normalized: string | null): number {
  return normalized === null ? 0 : Array.from(normalized).length;
}

/**
 * Validates an already-normalized value. Returns an error message, or
 * `null` when valid. Callers must run normalizeBio() first — this does
 * not itself normalize.
 */
export function validateNormalizedBio(normalized: string | null): string | null {
  if (normalized === null) {
    return null;
  }

  const length = countBioCodePoints(normalized);
  if (length > MAX_BIO_LENGTH) {
    return `自己紹介は${MAX_BIO_LENGTH}文字以内で入力してください（現在${length}文字）。`;
  }

  if (FORBIDDEN_BIO_CHARS.test(normalized)) {
    return "自己紹介に使用できない文字が含まれています。";
  }

  return null;
}

export { MAX_BIO_LENGTH };
