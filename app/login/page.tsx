import { redirect } from "next/navigation";

import { requireActiveAdmin } from "@/lib/admin/authorize";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { LoginForm } from "./login-form";

const ADMIN_PATH = "/admin";

/**
 * Allow-list of `next` destinations this page will redirect to after a
 * successful login — deliberately not a general "is this a safe relative
 * path" validator. A1 has exactly one protected route, so an allow-list of
 * one literal value eliminates any open-redirect risk. Extend this set
 * (never switch to pattern-matching arbitrary paths) if a future phase adds
 * more admin pages that should be linkable via `?next=`.
 */
const ALLOWED_NEXT_PATHS = new Set<string>([ADMIN_PATH]);

function resolveNextPath(nextParam: string | string[] | undefined): string {
  if (typeof nextParam === "string" && ALLOWED_NEXT_PATHS.has(nextParam)) {
    return nextParam;
  }
  return ADMIN_PATH;
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const { next } = await searchParams;
  const nextPath = resolveNextPath(next);

  const supabase = await createSupabaseServerClient();
  const authResult = await requireActiveAdmin(supabase);

  if (authResult.authorized) {
    // Already an active admin: sending them back to /login would be
    // pointless, and (per A1 §22) redirecting to /admin is the natural
    // behavior. requireActiveAdmin() is the same, unduplicated admin check
    // used by app/admin/layout.tsx and the existing Route Handlers.
    redirect(nextPath);
  }

  if (authResult.reason === "FORBIDDEN") {
    // Authenticated, but not an active admin (covers non-admin users and
    // suspended/banned admins alike — public.is_admin() already returns
    // false for both). Shown instead of the login form so a logged-in
    // non-admin is never told "not logged in" (A1 §23).
    return (
      <main>
        <h1>ログイン</h1>
        <p>ログイン済みですが、管理者権限がありません。</p>
      </main>
    );
  }

  return (
    <main>
      <h1>ログイン</h1>
      <LoginForm nextPath={nextPath} />
    </main>
  );
}
