import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { LogoutButton } from "@/app/admin/logout-button";
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
    <main className="mx-auto max-w-md px-4 py-8">
      <h1 className="text-2xl font-bold">マイページ</h1>

      <dl className="mt-6 flex flex-col gap-3 text-sm">
        <div>
          <dt className="font-bold">ユーザー名</dt>
          <dd>{profile.username}</dd>
        </div>
        <div>
          <dt className="font-bold">表示名</dt>
          <dd>{profile.display_name}</dd>
        </div>
        {user?.email ? (
          <div>
            <dt className="font-bold">メールアドレス</dt>
            <dd>{user.email}</dd>
          </div>
        ) : null}
        {profile.bio ? (
          <div>
            <dt className="font-bold">自己紹介</dt>
            <dd>{profile.bio}</dd>
          </div>
        ) : null}
        {profile.fan_since ? (
          <div>
            <dt className="font-bold">ファン歴</dt>
            <dd>{profile.fan_since}</dd>
          </div>
        ) : null}
      </dl>

      <p className="mt-6 text-sm text-gray-500">
        投稿・コメント・通報履歴の表示、プロフィールの編集は、今後のフェーズで提供予定です。
      </p>

      <div className="mt-6">
        <LogoutButton />
      </div>
    </main>
  );
}
