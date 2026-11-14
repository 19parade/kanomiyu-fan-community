/**
 * Builds an X (Twitter) Web Intent URL (https://twitter.com/intent/tweet).
 * `text`/`url` are passed as separate intent params (not concatenated into
 * one string) so X lays them out itself (text, then a line break, then the
 * link) — `encodeURIComponent` on each individually is what the intent
 * endpoint expects; URLSearchParams does the same encoding and additionally
 * guards against a caller accidentally forgetting it on one of the two.
 * The user still confirms/edits the draft and submits it themselves inside
 * the opened tab — this only prefills the compose box.
 */
export function buildXIntentUrl({ text, url }: { text: string; url: string }): string {
  const params = new URLSearchParams({ text, url });
  return `https://twitter.com/intent/tweet?${params.toString()}`;
}
