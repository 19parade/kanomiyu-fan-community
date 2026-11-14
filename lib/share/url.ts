import { SITE_NAME, SITE_URL } from "@/lib/legal/site-info";

/**
 * Builds the canonical absolute URL for a share target from a server-
 * provided path (e.g. `/feed/${id}`, `/live/${id}`) — never from
 * `window.location.href`. This is what guarantees query parameters/hash
 * fragments are never included (there is nothing to strip: the path is
 * composed fresh from the id, not read off the current address bar), and
 * that the shared link always points at the production domain
 * (`SITE_URL`, a hardcoded constant — never `localhost` or a Vercel
 * preview deployment URL, which `window.location.origin` could otherwise
 * pick up).
 */
export function buildCanonicalShareUrl(path: string): string {
  return `${SITE_URL}${path}`;
}

/**
 * Shared "site name｜title" label used for both the X post text and the
 * Instagram Stories image's title line (PM spec §4's exact format).
 */
export function buildShareLabel(title: string): string {
  return `${SITE_NAME}｜${title}`;
}
