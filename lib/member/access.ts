import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createSupabaseServerClient } from "@/lib/supabase/server";

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

/**
 * 施策2（2026-10-27パフォーマンス調査）: request-scoped memoization of
 * resolveMemberAccess(), so components/SiteHeader.tsx (rendered on every
 * page via the root layout) and that same page's own call both reuse one
 * result instead of each independently calling auth.getUser() (a real
 * network round trip to Supabase Auth, not a local JWT decode — see the
 * doc comment above) and re-querying `profiles`.
 *
 * Deliberately takes no arguments and creates its own Supabase client
 * internally, rather than accepting a caller-supplied `supabase` client as
 * resolveMemberAccess() does — React.cache() keys its memoization on the
 * function's arguments, and createSupabaseServerClient() returns a new
 * client *instance* on every call, so passing a client in as an argument
 * would give every call site a different cache key and silently defeat the
 * memoization entirely. With zero arguments, every call within the same
 * request is guaranteed to hit the same cache entry.
 *
 * Safety (explicitly verified, not assumed): per Next.js's own
 * documentation (node_modules/next/dist/docs/01-app/01-getting-started/
 * 06-fetching-data.md, "Reusing data with React.cache" — "React.cache is
 * scoped to the current request only. Each request gets its own
 * memoization scope with no sharing between requests"), this cannot leak
 * one user's auth result to a different user's request. It also cannot go
 * stale *within* a single request (e.g. after a mid-request status change)
 * because no code path in this app re-authenticates partway through
 * rendering one response.
 *
 * resolveMemberAccess() itself is kept exported and unchanged — any call
 * site that already holds its own `supabase` client for other queries and
 * wants to avoid creating a second client instance may still call it
 * directly; this wrapper is purely an additive, opt-in convenience.
 */
export const getMemberAccess = cache(async (): Promise<MemberAccess> => {
  const supabase = await createSupabaseServerClient();
  return resolveMemberAccess(supabase);
});
