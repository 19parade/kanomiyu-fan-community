import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * Proxy (A1) — the Next.js 16 file convention that replaces the deprecated
 * `middleware.ts` (see node_modules/next/dist/docs/01-app/03-api-reference/
 * 03-file-conventions/middleware.md: "deprecated ... renamed to proxy.js").
 *
 * Two responsibilities:
 *   1. F6 pre-launch site-wide maintenance gate (checked first, see below).
 *   2. Keep the Supabase session cookie fresh before `/login`, `/admin/*`,
 *      `/me`, and `/account/status` render, and nothing else. It does NOT
 *      perform admin or member authorization — that is decided exclusively
 *      by each route's own server-side guard (app/admin/layout.tsx's
 *      requireActiveAdmin() / public.is_admin(); app/login, app/me, app/
 *      account/status's resolveMemberAccess()), so a matcher mistake here
 *      can never grant access.
 *
 * Why the session-refresh half exists: @supabase/ssr's createServerClient
 * uses lazy session initialization and writes any refreshed token back to
 * cookies only through its `setAll` callback (node_modules/@supabase/ssr/
 * src/createServerClient.ts doc comment: "Middlewares ... you *must set up
 * a middleware* ... IMPORTANT: If cookies cannot be set from pages or
 * components, middleware *must* handle session updates"). Server
 * Components and layouts (app/admin/layout.tsx, app/login/page.tsx, app/
 * me/page.tsx, app/account/status/page.tsx) cannot write outgoing cookies
 * in this Next.js version, so without this proxy a token refresh triggered
 * by `auth.getUser()` there would be computed but never persisted back to
 * the browser.
 *
 * Route Handlers are intentionally excluded from the session-refresh
 * matcher: they already read/write their own cookies per-request via
 * lib/supabase/server.ts's createSupabaseServerClient(), so they do not
 * depend on this proxy, and ST3–ST5's existing API behavior is unaffected.
 *
 * -----------------------------------------------------------------------
 * F6 maintenance gate (read this before changing MAINTENANCE_MODE):
 *
 * Vercel's Deployment Protection (Vercel Authentication / SSO) is
 * configured as "all_except_custom_domains" — it does NOT cover
 * kanomiyu-fan.jp / www.kanomiyu-fan.jp, only the *.vercel.app URLs. A
 * production deploy would therefore make the custom domain publicly
 * reachable immediately, before the site is ready. This gate is the
 * free, code-level substitute for that missing coverage.
 *
 * Fail-closed by default: unless MAINTENANCE_MODE is the exact string
 * "false", every request matched below gets the static maintenance page
 * (no Supabase call, no session refresh, no dependency on env vars being
 * correctly configured). This mirrors SIGNUP_ENABLED's "default: closed"
 * convention elsewhere in this app (see app/signup/page.tsx).
 *
 * Bypass for the team to preview the live site while still gated: visit
 * any page with `?maintenance_bypass=<MAINTENANCE_BYPASS_SECRET>` once;
 * this sets an httpOnly cookie read on every subsequent request. Without
 * MAINTENANCE_BYPASS_SECRET configured, the bypass can never succeed.
 *
 * This gate is intentionally separate from SIGNUP_ENABLED: that one hides
 * only the /signup form after the site is otherwise live; this one hides
 * the entire site before it is live.
 * -----------------------------------------------------------------------
 */
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};

const MAINTENANCE_BYPASS_COOKIE = "maintenance_bypass";

function maintenancePage(): NextResponse {
  const html = `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex, nofollow" />
<title>準備中 | かのうみゆファンコミュニティ</title>
<style>
  body { font-family: system-ui, -apple-system, "Hiragino Sans", sans-serif; background: #fff8f3; color: #3a2e28; display: flex; min-height: 100vh; align-items: center; justify-content: center; margin: 0; padding: 24px; text-align: center; }
  main { max-width: 28rem; }
  h1 { font-size: 1.25rem; margin-bottom: 0.75rem; }
  p { line-height: 1.7; color: #6b5d55; }
</style>
</head>
<body>
<main>
<h1>只今準備中です</h1>
<p>かのうみゆファンコミュニティは、現在公開に向けて準備を進めています。<br />しばらくお待ちください。</p>
</main>
</body>
</html>`;
  return new NextResponse(html, {
    status: 503,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow",
      // Advisory only — crawlers/clients that honor it will back off and
      // retry later rather than treating this as a hard/permanent error.
      "Retry-After": "3600",
    },
  });
}

export async function proxy(request: NextRequest) {
  const maintenanceMode = process.env.MAINTENANCE_MODE !== "false";

  if (maintenanceMode) {
    const bypassSecret = process.env.MAINTENANCE_BYPASS_SECRET;
    const url = new URL(request.url);
    const queryBypass = url.searchParams.get("maintenance_bypass");
    const cookieBypass = request.cookies.get(MAINTENANCE_BYPASS_COOKIE)?.value;

    const bypassed =
      !!bypassSecret &&
      (queryBypass === bypassSecret || cookieBypass === bypassSecret);

    if (!bypassed) {
      return maintenancePage();
    }

    if (bypassSecret && queryBypass === bypassSecret) {
      // Set the bypass cookie once so subsequent navigations (which won't
      // repeat the query param) stay unlocked for this browser.
      const response = NextResponse.redirect(url.origin + url.pathname);
      response.cookies.set(MAINTENANCE_BYPASS_COOKIE, bypassSecret, {
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24, // 24h
      });
      return response;
    }
  }

  // The matcher above was widened to cover the whole site for the
  // maintenance gate. Keep the session-refresh half scoped to exactly
  // its original paths so turning maintenance mode off later doesn't
  // silently add a Supabase round-trip to every page load.
  const pathname = new URL(request.url).pathname;
  const needsSessionRefresh =
    pathname === "/login" ||
    pathname === "/me" ||
    pathname === "/account/status" ||
    pathname.startsWith("/admin/") ||
    pathname === "/admin";
  if (!needsSessionRefresh) {
    return NextResponse.next();
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    // A misconfigured deployment should fail loudly here rather than
    // silently skipping session refresh (which would surface later as a
    // confusing, hard-to-debug auth issue). No secret value is included.
    throw new Error(
      "Supabase environment variables are not configured (NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)."
    );
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        // Mirror the refreshed cookies onto the incoming request so that
        // Server Components rendered later in this same request see the
        // fresh session, then rebuild the response from that updated
        // request so the Set-Cookie headers also reach the browser.
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // Triggers a token refresh when needed; the refreshed cookies (if any)
  // are written back via setAll above. The verified user is not used here
  // — authorization happens only in each route's own server-side guard.
  await supabase.auth.getUser();

  return response;
}
