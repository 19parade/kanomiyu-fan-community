import Link from "next/link";

import { SignupForm } from "./signup-form";

/**
 * /signup — general member signup (F1). Server Component wrapper, mirrors
 * app/login/page.tsx's structure but has no admin-specific redirect logic:
 * unlike /login (which exists to let an admin authenticate), this page is
 * for any fan, and there is no general-purpose "already logged in" DAL
 * helper yet (PROJECT_SPEC 8章's DAL pattern is not built until a later
 * phase per M1's audit) — adding an ad hoc authenticated-redirect check
 * here would be scope creep beyond "会員登録のみ" (F1 §1/§4).
 *
 * The actual signUp() call, client-side validation, and error handling
 * live in signup-form.tsx (Client Component — needs state/handlers/the
 * browser Supabase client, same split as login-form.tsx).
 */
export default function SignupPage() {
  return (
    <main className="mx-auto max-w-md px-4 py-8">
      <h1 className="text-2xl font-bold">会員登録</h1>
      <SignupForm />
      <p className="mt-6 text-sm">
        すでにアカウントをお持ちの方は <Link href="/login" className="text-blue-600 underline">ログイン</Link>
      </p>
    </main>
  );
}
