/**
 * Classifies a news.source_url value for rendering purposes only. The real
 * security boundary is internal.normalize_news_content() (supabase/
 * migrations/20261108050000_news_admin_create.sql) — by the time a URL
 * reaches here it has already been validated server-side as either an
 * absolute `https://` URL or a safe same-site relative path (starting with
 * `/`, not `//`, no backslash). This helper only decides *how* to render an
 * already-trusted value (new tab + rel attributes for external, same-tab for
 * internal) and defensively treats anything that doesn't match either shape
 * as internal/relative rather than guessing — `<a href>` with a non-absolute
 * value is inert if it isn't actually a valid path, which is safer than
 * mis-rendering it as external.
 */
export function isExternalNewsLink(url: string): boolean {
  return url.startsWith("https://");
}
