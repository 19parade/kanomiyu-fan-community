/**
 * Minimal same-origin check for admin mutation Route Handlers.
 *
 * Next.js only performs this Origin-vs-Host comparison automatically for
 * Server Actions (see the "Data Security" guide in the local Next.js docs,
 * node_modules/next/dist/docs/01-app/02-guides/data-security.md, "Cross-Site
 * Request Forgery (CSRF)" section) — Route Handlers get no such built-in
 * protection, so admin mutation routes implement the same check themselves.
 *
 * The expected host is read from `X-Forwarded-Host` first (what a proxy in
 * front of the app — e.g. Vercel — sets to the original client-facing host),
 * falling back to `Host` for plain/local deployments with no proxy in front.
 * This mirrors Next's own Server Action check and shares its trust
 * assumption: the platform/proxy in front of this process is trusted not to
 * forward an attacker-controlled `Host`/`X-Forwarded-Host` unchanged. A
 * comparison at this layer cannot defend against a compromised proxy; it
 * only rejects requests whose *browser-supplied* `Origin` doesn't match the
 * host the platform says this request arrived on.
 *
 * Fails closed: a request with no `Origin` header is rejected. Browsers
 * always send `Origin` on `fetch`/`XHR` POST requests (same-origin or not),
 * so a same-origin admin UI calling this route is unaffected; the only
 * requests this turns away are non-browser clients that omit `Origin`
 * entirely, which is the intended behavior for an admin-only mutation route.
 */
export function isSameOriginRequest(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) {
    return false;
  }

  const expectedHost = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!expectedHost) {
    return false;
  }

  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    return false;
  }

  return originHost === expectedHost;
}
