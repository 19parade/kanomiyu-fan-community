import type { Metadata } from "next";

import { FansList, type PublicFanCard } from "@/components/fans/FansList";
import { buildPageMetadata } from "@/lib/seo/metadata";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const INITIAL_PAGE_SIZE = 20;

export const metadata: Metadata = buildPageMetadata({
  title: "ファン一覧",
  description: "かのうみゆさんのファンの一覧です。会員プロフィールから、他のファンとつながれます。",
  path: "/fans",
});

// The exact 6 columns get_public_profiles() returns (F4 audit) — never
// widened. No email, role, status, or consent info is ever selected.
type PublicProfileRpcRow = {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  bio: string | null;
  fan_since: string | null;
};

/**
 * /fans — public fan directory (F4-A). Server Component: fetches the
 * first page directly via get_public_profiles() (F4 audit), mirroring
 * app/music/(list)/page.tsx's structure.
 *
 * createSupabaseServerClient() is cookie-bound — a logged-in visitor's own
 * session reaches the RPC as themselves (so get_public_profiles()'s
 * authenticated-branch block filtering applies to them), while an
 * anonymous visitor degrades to the RPC's anon branch. Never service_role,
 * never a fixed/shared client that would discard the caller's actual
 * cookies.
 *
 * Only the public profile RPC is used here — this page never selects from
 * public.profiles directly, and never touches auth.users.
 */
export default async function FansPage() {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.rpc("get_public_profiles", {
    search: null,
    after_username: null,
    after_id: null,
    page_size: INITIAL_PAGE_SIZE,
  });

  if (error) {
    // Never surface the raw DB error message to the browser.
    console.error("fans list page: initial get_public_profiles failed", error.message);
    return (
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <h1 className="text-2xl font-bold sm:text-3xl">ファン一覧</h1>
        <p role="alert" className="mt-4 text-red-600">
          会員一覧の取得に失敗しました。
        </p>
      </main>
    );
  }

  const rows = (data ?? []) as PublicProfileRpcRow[];
  const fans: PublicFanCard[] = rows.map((row) => ({
    id: row.id,
    username: row.username,
    display_name: row.display_name,
    avatar_url: row.avatar_url,
    bio: row.bio,
    fan_since: row.fan_since,
  }));

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-bold sm:text-3xl">ファン一覧</h1>
      <p className="mt-2 text-sm text-muted">かのうみゆさんのファンの一覧です。</p>
      <FansList initialFans={fans} initialHasMore={rows.length === INITIAL_PAGE_SIZE} />
    </main>
  );
}
