import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { ContactLink } from "@/components/legal/LegalPage";
import { resolveMemberAccess } from "@/lib/member/access";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { LoginForm } from "./login-form";

const ADMIN_PATH = "/admin";

/**
 * Allow-list of `next` destinations this page will redirect an *admin*
 * caller to after a successful login — deliberately not a general "is this
 * a safe relative path" validator. There is exactly one protected route
 * that supports deep-linking via `?next=`, so an allow-list of one literal
 * value eliminates any open-redirect risk. `next` has no effect for a
 * non-admin outcome (member/suspended/banned) — those always go to their
 * own fixed destination below, which keeps this the only place in the app
 * that ever branches on a client-suppliable redirect target.
 */
const ALLOWED_NEXT_PATHS = new Set<string>([ADMIN_PATH]);

function resolveNextParam(nextParam: string | string[] | undefined): string | undefined {
  if (typeof nextParam === "string" && ALLOWED_NEXT_PATHS.has(nextParam)) {
    return nextParam;
  }
  return undefined;
}

export const metadata: Metadata = {
  title: "ログイン",
};

// profiles.status can change between requests (e.g. an admin suspends this
// account), so this page must never serve a cached decision — every load
// re-evaluates resolveMemberAccess() against the live DB. cookies() (used
// inside createSupabaseServerClient()) already opts this route into dynamic
// rendering; this is kept explicit as defense-in-depth against a future
// refactor silently dropping that.
export const dynamic = "force-dynamic";

/**
 * /login — common login for both general members and admins (F3-B). A
 * single source of truth for "where does an authenticated session go":
 * both a direct visit while already logged in, and the redirect back here
 * right after login-form.tsx's signInWithPassword() succeeds, run through
 * the exact same resolveMemberAccess() branch below. The client never
 * computes or is trusted for the destination (see login-form.tsx).
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const { next } = await searchParams;
  const adminNext = resolveNextParam(next);

  const supabase = await createSupabaseServerClient();
  const access = await resolveMemberAccess(supabase);

  if (access.kind === "admin_active") {
    redirect(adminNext ?? ADMIN_PATH);
  }

  if (access.kind === "member_active") {
    redirect("/me");
  }

  if (access.kind === "suspended" || access.kind === "banned") {
    redirect("/account/status");
  }

  if (access.kind === "invalid") {
    // Authenticated (a real Supabase Auth session exists) but the DB side
    // could not be positively classified (no profiles row, an unrecognized
    // role/status value, or the read itself failed). Fail closed: never
    // fall through to the login form (re-submitting credentials cannot fix
    // a missing/invalid profile row) and never guess a destination. No
    // internal detail (error message, missing column, etc.) is shown.
    return (
      <main className="mx-auto max-w-md px-4 py-8">
        <h1 className="text-2xl font-bold">ログイン</h1>
        <p className="mt-6" role="alert">
          アカウント情報を確認できませんでした。しばらくしてから再度お試しいただくか、お問い合わせください。
        </p>
        <p className="mt-2 text-sm">
          お問い合わせ：<ContactLink />
        </p>
      </main>
    );
  }

  // access.kind === "unauthenticated" from here on.

  return (
    <main className="mx-auto max-w-md px-4 py-8">
      <h1 className="text-2xl font-bold">ログイン</h1>
      <LoginForm next={adminNext} />
      <p className="mt-6 text-sm">
        アカウントをお持ちでない方は <Link href="/signup" className="text-blue-600 underline">会員登録</Link>
      </p>
    </main>
  );
}
