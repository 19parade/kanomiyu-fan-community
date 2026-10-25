/**
 * Shared URL detection for posts.content — used both client-side
 * (PostForm's compose-time preview trigger) and server-side (rendering
 * clickable links / looking up cached link_previews rows). A single
 * implementation so "which URL gets a preview" is always computed the same
 * way regardless of where it's called from.
 *
 * Only http(s) URLs are detected (matches what app/api/link-preview/route.ts
 * will accept — there would be no point detecting a scheme that endpoint
 * always rejects).
 *
 * CJK bracket/quote characters (「」『』【】) are excluded from the match
 * itself, since they are extremely common as prose delimiters around a URL
 * in Japanese text (e.g. "詳しくは「https://example.com」から") and are
 * never actually part of a real URL. Parentheses are NOT excluded (some
 * legitimate URLs, e.g. Wikipedia article titles, contain them) — a
 * trailing unbalanced ')' is stripped separately by trimTrailingPunctuation
 * below instead.
 *
 * "…" is also excluded: lib/posts/format.ts's excerptContent() truncates
 * long content mid-string and appends "…" with no separating space, which
 * would otherwise either get swallowed into the "URL" itself or (see
 * splitContentIntoSegments below) linkify an incomplete, truncated URL.
 */
const URL_REGEX = /https?:\/\/[^\s　<>"'「」『』【】…]+/g;

const SIMPLE_TRAILING_PUNCTUATION = new Set([".", ",", "!", "?", ";", ":", "'", '"', "、", "。"]);

/**
 * Strips trailing characters that are almost always sentence punctuation
 * rather than part of the URL (e.g. "https://example.com." at the end of a
 * sentence, or "(https://example.com)" where the closing paren belongs to
 * the surrounding prose, not the URL itself).
 */
function trimTrailingPunctuation(url: string): string {
  let end = url.length;

  while (end > 0) {
    const ch = url[end - 1];

    if (ch === ")") {
      const prefix = url.slice(0, end);
      const opens = (prefix.match(/\(/g) ?? []).length;
      const closes = (prefix.match(/\)/g) ?? []).length;
      // More (or equal) '(' than ')' means this ')' is balanced by one
      // inside the URL itself — keep it and stop trimming.
      if (opens >= closes) {
        break;
      }
      end -= 1;
      continue;
    }

    if (SIMPLE_TRAILING_PUNCTUATION.has(ch)) {
      end -= 1;
      continue;
    }

    break;
  }

  return url.slice(0, end);
}

export type PostContentSegment = { type: "text"; value: string } | { type: "url"; value: string };

/**
 * Splits post content into alternating text/url segments, in order, for
 * rendering (plain text stays plain, url segments become links). Empty
 * leading/trailing text segments are omitted; consecutive text is never
 * split further than necessary.
 */
export function splitContentIntoSegments(content: string): PostContentSegment[] {
  const segments: PostContentSegment[] = [];
  let lastIndex = 0;
  const regex = new RegExp(URL_REGEX);
  let match: RegExpExecArray | null;

  while ((match = regex.exec(content)) !== null) {
    const trimmed = trimTrailingPunctuation(match[0]);
    if (trimmed.length === 0) {
      continue;
    }

    // A match ending exactly where "…" (excerptContent()'s truncation
    // marker) begins is almost certainly a URL cut off mid-string, not a
    // real, followable link — render it as plain text instead.
    const matchEnd = match.index + match[0].length;
    const truncated = content[matchEnd] === "…";

    if (match.index > lastIndex) {
      segments.push({ type: "text", value: content.slice(lastIndex, match.index) });
    }
    if (truncated) {
      segments.push({ type: "text", value: match[0] });
    } else {
      segments.push({ type: "url", value: trimmed });
    }
    lastIndex = match.index + (truncated ? match[0].length : trimmed.length);
  }

  if (lastIndex < content.length) {
    segments.push({ type: "text", value: content.slice(lastIndex) });
  }

  return segments;
}

/** The single URL (if any) a post's link preview card is generated for — always the first one found. */
export function extractFirstUrl(content: string): string | null {
  for (const segment of splitContentIntoSegments(content)) {
    if (segment.type === "url") {
      return segment.value;
    }
  }
  return null;
}
