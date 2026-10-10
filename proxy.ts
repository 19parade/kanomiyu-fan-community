import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * Proxy (A1) — the Next.js 16 file convention that replaces the deprecated
 * `middleware.ts` (see node_modules/next/dist/docs/01-app/03-api-reference/
 * 03-file-conventions/middleware.md: "deprecated ... renamed to proxy.js").
 *
 * Sole responsibility: keep the Supabase session cookie fresh before
 * `/login`, `/admin/*`, `/me`, and `/account/status` render, and nothing
 * else. It does NOT perform admin or member authorization — that is
 * decided exclusively by each route's own server-side guard
 * (app/admin/layout.tsx's requireActiveAdmin() / public.is_admin(); app/
 * login, app/me, app/account/status's resolveMemberAccess()), so a matcher
 * mistake here can never grant access.
 *
 * Why this exists: @supabase/ssr's createServerClient uses lazy session
 * initialization and writes any refreshed token back to cookies only
 * through its `setAll` callback (node_modules/@supabase/ssr/src/
 * createServerClient.ts doc comment: "Middlewares ... you *must set up a
 * middleware* ... IMPORTANT: If cookies cannot be set from pages or
 * components, middleware *must* handle session updates"). Server
 * Components and layouts (app/admin/layout.tsx, app/login/page.tsx, app/
 * me/page.tsx, app/account/status/page.tsx) cannot write outgoing cookies
 * in this Next.js version, so without this proxy a token refresh triggered
 * by `auth.getUser()` there would be computed but never persisted back to
 * the browser.
 *
 * Route Handlers are intentionally excluded from the matcher below: they
 * already read/write their own cookies per-request via
 * lib/supabase/server.ts's createSupabaseServerClient(), so they do not
 * depend on this proxy, and ST3–ST5's existing API behavior is unaffected.
 */
export const config = {
  matcher: ["/admin/:path*", "/login", "/me", "/account/status"],
};

export async function proxy(request: NextRequest) {
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
