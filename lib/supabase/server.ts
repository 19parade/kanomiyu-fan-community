import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

/**
 * Server-only, user-scoped Supabase client for use inside Route Handlers and
 * Server Actions (App Router). It authenticates as the calling browser's
 * session (via the request's cookies), so every Postgres/Storage RLS policy
 * is evaluated as that user — never as service_role.
 *
 * Do not import this from a Client Component. Do not use this for
 * unauthenticated/background work; there is a separate, not-yet-implemented
 * service-role client for that (SUPABASE_SERVICE_ROLE_KEY must stay
 * server-only and is not read here).
 */
export async function createSupabaseRouteHandlerClient() {
  const cookieStore = await cookies();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error(
      "Supabase environment variables are not configured (NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)."
    );
  }

  return createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        // Route Handlers may write outgoing cookies (unlike Server Components).
        // If this client is ever imported somewhere that cannot set cookies,
        // fail silently rather than crashing the request.
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // no-op: not writable in this context.
        }
      },
    },
  });
}
