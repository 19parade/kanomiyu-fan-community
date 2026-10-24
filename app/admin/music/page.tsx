import Link from "next/link";

import { MusicAdminList, type AdminSongRow } from "@/components/admin/music/MusicAdminList";
import { buttonClassName } from "@/components/ui/Button";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const INITIAL_PAGE_SIZE = 20;

/**
 * /admin/music — read-only song list (A2). Server Component: fetches the
 * first page directly via get_admin_songs() (S4a) using the same
 * server-scoped client app/admin/layout.tsx's guard already used for this
 * request. That guard already blocks non-admins from reaching this page at
 * all; this RPC call's own SONG_MANAGEMENT_NOT_AUTHORIZED check is kept as
 * defense-in-depth (A2 §86), not skipped just because the layout ran.
 *
 * Search, status filtering, and "load more" are handled entirely by the
 * Client Component below against GET /api/admin/music — this page never
 * re-fetches on its own after the first render.
 */
export default async function AdminMusicPage() {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.rpc("get_admin_songs", {
    search: null,
    status_filter: null,
    after_release_date: null,
    after_id: null,
    page_size: INITIAL_PAGE_SIZE,
  });

  if (error) {
    // Never surface the raw DB error message to the browser.
    console.error("admin music page: initial get_admin_songs failed", error.message);
    return (
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <h1 className="text-2xl font-bold sm:text-3xl">楽曲管理</h1>
        <p role="alert" className="mt-4 text-red-600">
          楽曲一覧の取得に失敗しました。
        </p>
      </main>
    );
  }

  const songs = (data ?? []) as AdminSongRow[];

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold sm:text-3xl">楽曲管理</h1>
          <p className="mt-2 text-sm text-muted">楽曲の一覧を確認できます。</p>
        </div>
        <Link href="/admin/music/new" className={buttonClassName("primary", "w-full sm:w-auto")}>
          楽曲を追加
        </Link>
      </div>
      <MusicAdminList initialSongs={songs} initialHasMore={songs.length === INITIAL_PAGE_SIZE} />
    </main>
  );
}
