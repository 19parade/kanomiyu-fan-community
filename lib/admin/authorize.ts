import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Server-only admin authorization check for use inside Route Handlers /
 * Server Actions that already hold a user-scoped Supabase client (see
 * lib/supabase/server.ts). This does not read cookies or headers itself —
 * it only wraps the two calls every admin-only endpoint needs:
 *
 *   1. supabase.auth.getUser() — is there a real, currently valid session?
 *      (Never trust "a cookie is present" as authentication by itself.)
 *   2. supabase.rpc("is_admin") — the existing DB-side authorization
 *      predicate (active admin only; see supabase/migrations/
 *      20260920052609_authorization_helpers.sql), called through the
 *      user's own session so Postgres evaluates it with that user's
 *      privileges — not service_role.
 *
 * This is deliberately *not* the only authorization boundary: Storage RLS
 * policies (song_images_admin_insert / _select / _delete) independently
 * re-check public.is_admin() on every Storage operation. This helper exists
 * so the application can reject non-admins before doing any Storage/file
 * work, and to return a stable, non-leaky error to the caller.
 */
export type AdminAuthorizationResult =
  | { authorized: true; userId: string }
  | { authorized: false; reason: "UNAUTHENTICATED" | "FORBIDDEN" };

export async function requireActiveAdmin(
  supabase: SupabaseClient
): Promise<AdminAuthorizationResult> {
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData.user) {
    return { authorized: false, reason: "UNAUTHENTICATED" };
  }

  const { data: isAdmin, error: adminError } = await supabase.rpc("is_admin");

  if (adminError || isAdmin !== true) {
    return { authorized: false, reason: "FORBIDDEN" };
  }

  return { authorized: true, userId: userData.user.id };
}
