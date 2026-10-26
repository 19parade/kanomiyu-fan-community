import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { LogoutButton } from "@/app/admin/logout-button";
import { ProfileEditForm } from "@/components/me/ProfileEditForm";
import { Card } from "@/components/ui/Card";
import { UNOFFICIAL_LABEL } from "@/lib/legal/site-info";
import { getMemberAccess } from "@/lib/member/access";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "マイページ",
};

// Must re-evaluate profiles.status on every request (see app/login/page.tsx
// for why) — never served from a cache.
export const dynamic = "force-dynamic";

type OwnProfile = {
  username: string;
  display_name: string;
  bio: string | null;
  fan_since: string | null;
};

/**
 * /me — minimal member mypage (F3-B §4). Authorization is re-verified here
 * independently of how the caller arrived (the /login redirect is only a
 * best-effort UX hint, never a trust boundary — exactly like app/admin/
 * layout.tsx's existing pattern): unauthenticated and "invalid" (no/broken
 * profile row) both bounce to /login, which is the single place that
 * decides what an authenticated session actually sees. suspended/banned
 * are sent to /account/status instead of being shown this page.
 *
 * Posts/comments/report history are still out of scope (later phases add
 * them). Editing display_name/bio/fan_since is implemented via
 * components/me/ProfileEditForm.tsx (F4-C2) — username/role/status/email/
 * avatar_url/consent fields are never editable there.
 */
export default async function MePage() {
  const access = await getMemberAccess();
  const supabase = await createSupabaseServerClient();

  if (access.kind === "unauthenticated" || access.kind === "invalid") {
    redirect("/login");
  }

  if (access.kind === "suspended" || access.kind === "banned") {
    redirect("/account/status");
  }

  if (access.kind === "admin_active") {
    redirect("/admin");
  }

  // access.kind === "member_active" from here on.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("username, display_name, bio, fan_since")
    .eq("id", access.userId)
    .maybeSingle<OwnProfile>();

  if (!profile) {
    // profiles row vanished between resolveMemberAccess() and here
    // (extremely unlikely given FK RESTRICT, but never assumed). Fail
    // closed the same way resolveMemberAccess() itself does.
    redirect("/login");
  }

  return (
    <main className="mx-auto max-w-md px-4 py-10 sm:py-16">
      <span className="inline-block rounded-full bg-foreground/5 px-3 py-1 text-xs font-bold text-muted">
        {UNOFFICIAL_LABEL}
      </span>
      <h1 className="mt-3 text-2xl font-bold">マイページ</h1>

      <Card className="mt-6 p-6 sm:p-8">
        <ProfileEditForm userId={access.userId} profile={profile} email={user?.email ?? null} />
      </Card>

      <div className="mt-4 rounded-2xl border border-dashed border-border px-6 py-5 text-sm leading-relaxed text-muted">
        投稿・コメント・通報履歴の表示は、今後のフェーズで提供予定です。
      </div>

      <div className="mt-6">
        <LogoutButton />
      </div>
    </main>
  );
}
