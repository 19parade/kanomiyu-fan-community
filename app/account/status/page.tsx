import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { LogoutButton } from "@/app/admin/logout-button";
import { ContactLink } from "@/components/legal/LegalPage";
import { resolveMemberAccess } from "@/lib/member/access";
import { createSupabaseServerClient } from "@/lib/supabase/server";

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
  const supabase = await createSupabaseServerClient();
  const access = await resolveMemberAccess(supabase);

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

  return (
    <main className="mx-auto max-w-md px-4 py-8">
      <h1 className="text-2xl font-bold">アカウントの状態</h1>
      <p className="mt-6" role="status">
        {message}
      </p>
      <p className="mt-4 text-sm">
        お問い合わせ：<ContactLink />
      </p>
      <div className="mt-6">
        <LogoutButton />
      </div>
    </main>
  );
}
