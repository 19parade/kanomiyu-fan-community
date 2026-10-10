import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { LogoutButton } from "@/app/admin/logout-button";
import { Card } from "@/components/ui/Card";
import { UNOFFICIAL_LABEL } from "@/lib/legal/site-info";
import { resolveMemberAccess } from "@/lib/member/access";
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
 * Posts/comments/report history and profile editing are out of scope for
 * this phase (F3-B §4) — later phases add them.
 */
export default async function MePage() {
  const supabase = await createSupabaseServerClient();
  const access = await resolveMemberAccess(supabase);

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
        <div className="flex items-center gap-3">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand/20 to-accent/20 text-lg font-bold text-brand">
            {profile.display_name.slice(0, 1)}
          </div>
          <div className="min-w-0">
            <p className="truncate font-bold">{profile.display_name}</p>
            <p className="truncate text-sm text-muted">@{profile.username}</p>
          </div>
        </div>

        <dl className="mt-6 flex flex-col gap-4 border-t border-border pt-6 text-sm">
          {user?.email ? (
            <div>
              <dt className="font-bold text-muted">メールアドレス</dt>
              <dd className="mt-1">{user.email}</dd>
            </div>
          ) : null}
          {profile.bio ? (
            <div>
              <dt className="font-bold text-muted">自己紹介</dt>
              <dd className="mt-1 whitespace-pre-wrap">{profile.bio}</dd>
            </div>
          ) : null}
          {profile.fan_since ? (
            <div>
              <dt className="font-bold text-muted">ファン歴</dt>
              <dd className="mt-1">{profile.fan_since}</dd>
            </div>
          ) : null}
        </dl>
      </Card>

      <div className="mt-4 rounded-2xl border border-dashed border-border px-6 py-5 text-sm leading-relaxed text-muted">
        投稿・コメント・通報履歴の表示、プロフィールの編集は、今後のフェーズで提供予定です。
      </div>

      <div className="mt-6">
        <LogoutButton />
      </div>
    </main>
  );
}
