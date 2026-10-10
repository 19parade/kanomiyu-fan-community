import type { Metadata } from "next";

import { MusicList, type PublicSongCard } from "@/components/music/MusicList";
import { getSongImagePublicUrl } from "@/lib/song-images/public-url";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const INITIAL_PAGE_SIZE = 20;

// Static (not generateMetadata): this page's title/description never
// depend on request data — unlike /music/[id], there is nothing
// draft/private that could leak through it.
export const metadata: Metadata = {
  title: "楽曲一覧",
  description: "公開中の楽曲一覧です。",
};

// The exact 4 columns get_public_songs() returns (S2) — never widened.
type PublicSongRpcRow = {
  id: string;
  title: string;
  release_date: string | null;
  cover_image_url: string | null;
};

/**
 * /music — public song listing (P1). Server Component: fetches the first
 * page directly via get_public_songs() (S2), unauthenticated-friendly.
 *
 * No admin/auth guard of any kind — this route is intentionally reachable
 * by anonymous visitors. createSupabaseServerClient() degrades to an
 * anonymous-role client when no session cookie is present (never
 * service_role); get_public_songs() itself already only returns
 * status='public' rows regardless of caller.
 *
 * Each row's cover_image_url (a Storage object key) is resolved to a
 * display URL here, server-side, via lib/song-images/public-url.ts — the
 * Client Component below never receives a raw object key and never calls
 * Supabase/Storage directly.
 *
 * "Load more" is handled entirely by the Client Component below against
 * GET /api/music — this page never re-fetches on its own after the first
 * render.
 */
export default async function MusicListPage() {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.rpc("get_public_songs", {
    after_release_date: null,
    after_id: null,
    page_size: INITIAL_PAGE_SIZE,
  });

  if (error) {
    // Never surface the raw DB error message to the browser.
    console.error("music list page: initial get_public_songs failed", error.message);
    return (
      <main className="mx-auto max-w-5xl px-4 py-8">
        <h1 className="text-2xl font-bold">楽曲一覧</h1>
        <p role="alert" className="mt-4 text-red-600">
          楽曲一覧の取得に失敗しました。
        </p>
      </main>
    );
  }

  const rows = (data ?? []) as PublicSongRpcRow[];
  const songs: PublicSongCard[] = rows.map((row) => ({
    id: row.id,
    title: row.title,
    release_date: row.release_date,
    cover_image_url: getSongImagePublicUrl(supabase, row.cover_image_url),
  }));

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="text-2xl font-bold">楽曲一覧</h1>
      <MusicList initialSongs={songs} initialHasMore={rows.length === INITIAL_PAGE_SIZE} />
    </main>
  );
}
