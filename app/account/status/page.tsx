import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { LogoutButton } from "@/app/admin/logout-button";
import { Card } from "@/components/ui/Card";
import { ContactLink } from "@/components/legal/LegalPage";
import { UNOFFICIAL_LABEL } from "@/lib/legal/site-info";
import { getMemberAccess } from "@/lib/member/access";

export const metadata: Metadata = {
  title: "アカウントの状態",
};

// Must re-evaluate profiles.status on every request — never cached (see
// app/login/page.tsx).
export const dynamic = "force-dynamic";

/**
 * /account/status — suspended/banned member notice (F3-B §5). Reached only
 * via app/login/page.tsx's redirect, but re-verifies independently (same
 * reasoning as app/me/page.tsx): a direct visit by an active member or an
 * unauthenticated visitor is sent to its own correct destination rather
 * than shown this page.
 *
 * No suspension/ban reason and no other personal data is rendered here —
 * only the two fixed, PM-approved notice texts and the contact address.
 */
export default async function AccountStatusPage() {
  const access = await getMemberAccess();

  if (access.kind === "unauthenticated" || access.kind === "invalid") {
    redirect("/login");
  }

  if (access.kind === "admin_active") {
    redirect("/admin");
  }

  if (access.kind === "member_active") {
    redirect("/me");
  }

  // access.kind === "suspended" || access.kind === "banned" from here on.
  const message =
    access.kind === "suspended"
      ? "アカウントの一部機能が制限されています。閲覧は引き続き利用できますが、新しい投稿やコメント等は行えません。"
      : "アカウントの利用が制限されています。他の会員のコンテンツは閲覧できません。";

  // Visual distinction only (D4 §"状態の違いが適切に伝わるデザイン") — both
  // use calm, pastel tones rather than an alarming bright red, per
  // "過度に威圧的なデザインにしない". The `message` text itself (above) is
  // unchanged from F3-B.
  const toneClass =
    access.kind === "suspended"
      ? "border-amber-200 bg-amber-50 text-amber-900"
      : "border-rose-200 bg-rose-50 text-rose-900";

  return (
    <main className="mx-auto max-w-md px-4 py-10 sm:py-16">
      <span className="inline-block rounded-full bg-foreground/5 px-3 py-1 text-xs font-bold text-muted">
        {UNOFFICIAL_LABEL}
      </span>
      <h1 className="mt-3 text-2xl font-bold">アカウントの状態</h1>

      <div className={`mt-6 rounded-2xl border px-6 py-5 text-sm leading-relaxed ${toneClass}`} role="status">
        {message}
      </div>

      <Card className="mt-4 p-6">
        <p className="text-sm font-bold">お問い合わせ</p>
        <p className="mt-1 text-sm">
          <ContactLink />
        </p>
      </Card>

      <div className="mt-6">
        <LogoutButton />
      </div>
    </main>
  );
}
