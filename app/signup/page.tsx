import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";

import { Card } from "@/components/ui/Card";
import { ContactLink } from "@/components/legal/LegalPage";
import { LEGAL_PAGES, UNOFFICIAL_LABEL } from "@/lib/legal/site-info";

import { SignupForm } from "./signup-form";

export const metadata: Metadata = {
  title: "会員登録",
};

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
 *
 * S1-B1: the form is shown only when the server-side env flag
 * SIGNUP_ENABLED is exactly "true" (default: closed), so that consent to the
 * still-draft 利用規約 / プライバシーポリシー is not collected from the
 * public. This hides the UI only: signUp() against Supabase Auth with the
 * public anon key is not blocked by this page — disabling signups there is a
 * Supabase Auth setting, deliberately not changed here.
 * connection() makes the flag read at request time, not at build time.
 */
export default async function SignupPage() {
  await connection();
  const signupEnabled = process.env.SIGNUP_ENABLED === "true";

  if (!signupEnabled) {
    return (
      <main className="mx-auto max-w-md px-4 py-10 leading-7 sm:py-16">
        <span className="inline-block rounded-full bg-foreground/5 px-3 py-1 text-xs font-bold text-muted">
          {UNOFFICIAL_LABEL}
        </span>
        <h1 className="mt-3 text-2xl font-bold">会員登録</h1>

        <div
          role="status"
          className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm leading-relaxed text-amber-900"
        >
          <p className="font-bold">現在、会員登録の受付を停止しています（準備中）。</p>
          <p className="mt-2">
            利用規約・プライバシーポリシーの正式版が確定するまで、一般の方の会員登録は受け付けていません。
          </p>
        </div>

        <Card className="mt-4 p-5 text-sm">
          <p>
            お問い合わせは <ContactLink /> までお願いします。
          </p>
          <p className="mt-3 text-muted">
            準備中の規約・ポリシー（開発用ドラフト）：
            {LEGAL_PAGES.map((page, index) => (
              <span key={page.href}>
                {index > 0 ? "、" : ""}
                <Link href={page.href} className="font-bold text-brand underline-offset-2 hover:underline">
                  {page.label}
                </Link>
              </span>
            ))}
          </p>
        </Card>

        <p className="mt-6 text-center text-sm text-muted">
          すでにアカウントをお持ちの方は{" "}
          <Link href="/login" className="font-bold text-brand underline-offset-2 hover:underline">
            ログイン
          </Link>
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-md px-4 py-10 sm:py-16">
      <span className="inline-block rounded-full bg-foreground/5 px-3 py-1 text-xs font-bold text-muted">
        {UNOFFICIAL_LABEL}
      </span>
      <h1 className="mt-3 text-2xl font-bold">会員登録</h1>

      <div
        role="note"
        className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-relaxed text-amber-900"
      >
        <p>
          開発・検証用に会員登録の受付を有効にしています。利用規約・プライバシーポリシーは開発用ドラフトで、正式に施行されたものではありません。
        </p>
      </div>

      <Card className="mt-6 p-6 sm:p-8">
        <SignupForm />
      </Card>

      <p className="mt-6 text-center text-sm text-muted">
        すでにアカウントをお持ちの方は{" "}
        <Link href="/login" className="font-bold text-brand underline-offset-2 hover:underline">
          ログイン
        </Link>
      </p>
    </main>
  );
}
