import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Server-only role/status resolution for the common /login flow and for any
 * page that needs to know "who is this, and what state are they in" (F3-B:
 * /me, /account/status). This is deliberately separate from
 * lib/admin/authorize.ts's requireActiveAdmin() — that function and its only
 * caller (app/admin/layout.tsx) are untouched by this phase, so the existing
 * admin authorization boundary carries zero risk of regression.
 *
 * Every result is derived from a fresh, per-request read of
 * `auth.getUser()` (re-validates the session against Supabase Auth, not a
 * decoded-only JWT) followed by a live `profiles` row lookup scoped by RLS
 * (`profiles_select_own`: `id = auth.uid()`, no new RPC/migration needed —
 * confirmed in F3-A that table-level SELECT on profiles carries no
 * column-level restriction, only UPDATE is column-restricted). Nothing here
 * ever reads role/status from a client-supplied value, a cookie payload, or
 * JWT custom claims — only from this live query.
 *
 * Fail-closed by construction: any outcome this function cannot positively
 * classify as one of the known role/status combinations collapses to
 * `{ kind: "invalid" }`, never to a permissive default.
 */
export type MemberAccess =
  | { kind: "unauthenticated" }
  | { kind: "invalid" }
  | { kind: "admin_active"; userId: string }
  | { kind: "member_active"; userId: string }
  | { kind: "suspended"; userId: string }
  | { kind: "banned"; userId: string };

const KNOWN_ROLES = new Set(["member", "admin"]);
const KNOWN_STATUSES = new Set(["active", "suspended", "banned"]);

export async function resolveMemberAccess(supabase: SupabaseClient): Promise<MemberAccess> {
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData.user) {
    return { kind: "unauthenticated" };
  }

  const userId = userData.user.id;

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role, status")
    .eq("id", userId)
    .maybeSingle();

  if (profileError || !profile) {
    // No profile row, or the read itself failed: never treated as
    // "unauthenticated" (that would route back to the login form, which is
    // harmless) but kept as its own `invalid` case so callers can show a
    // dedicated message rather than silently defaulting anywhere.
    return { kind: "invalid" };
  }

  const { role, status } = profile as { role: unknown; status: unknown };

  if (typeof role !== "string" || !KNOWN_ROLES.has(role)) {
    return { kind: "invalid" };
  }
  if (typeof status !== "string" || !KNOWN_STATUSES.has(status)) {
    return { kind: "invalid" };
  }

  if (status === "banned") {
    return { kind: "banned", userId };
  }
  if (status === "suspended") {
    return { kind: "suspended", userId };
  }

  // status === "active"
  return role === "admin" ? { kind: "admin_active", userId } : { kind: "member_active", userId };
}
