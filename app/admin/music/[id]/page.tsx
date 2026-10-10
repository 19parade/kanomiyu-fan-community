import Link from "next/link";
import { notFound } from "next/navigation";

import { EditSongForm } from "@/components/admin/music/EditSongForm";
import { getSongImagePublicUrl } from "@/lib/song-images/public-url";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const UUID_SHAPE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

type AdminSongDetail = {
  id: string;
  title: string;
  release_date: string | null;
  cover_image_url: string | null;
  description: string | null;
  status: string;
  created_at: string;
  updated_at: string;
};

/**
 * /admin/music/[id] — song edit page (A4). Server Component: validates the
 * `id` route param's *shape* before ever handing it to a DB call (so a
 * malformed value never reaches `get_admin_song` and surfaces as a raw
 * Postgres 22P02 cast error — same precaution as the existing
 * `PATCH /api/admin/music/[id]` route), then fetches the song via
 * `get_admin_song` (S4b, unchanged) using the same server-scoped client
 * app/admin/layout.tsx's guard already used for this request (that guard's
 * authorization is not re-litigated here; the RPC's own
 * `SONG_MANAGEMENT_NOT_AUTHORIZED` check remains as defense-in-depth,
 * consistent with A2/A3).
 *
 * An invalid UUID shape and a nonexistent song both render the same
 * not-found.tsx — this is specifically a "no such song" outcome, never
 * confused with an authorization failure (which the layout already
 * handles before this page can even run).
 *
 * `song.cover_image_url` (a Storage object key) is resolved to a display
 * URL here, server-side, via lib/song-images/public-url.ts — the Client
 * Component below never calls Supabase/Storage directly.
 *
 * `EditSongForm` is keyed by `song.updated_at`: whenever this page
 * re-fetches with a *different* updated_at (via the form's own
 * `router.refresh()`, after a successful cover replace/remove or after the
 * admin chooses to reload past a 409 conflict), React remounts the form
 * with fresh initial values instead of trying to patch stale local state —
 * see EditSongForm.tsx for why that matters here.
 */
export default async function EditSongPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  if (!UUID_SHAPE.test(id)) {
    notFound();
  }

  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.rpc("get_admin_song", { target_song_id: id });

  if (error) {
    // Never surface the raw DB error message to the browser.
    console.error("edit song page: get_admin_song failed", error.message);
    return (
      <main>
        <h1>楽曲を編集</h1>
        <p role="alert">楽曲情報の取得に失敗しました。</p>
      </main>
    );
  }

  const song = (Array.isArray(data) ? data[0] : undefined) as AdminSongDetail | undefined;

  if (!song) {
    notFound();
  }

  const coverImageUrl = getSongImagePublicUrl(supabase, song.cover_image_url);

  return (
    <main>
      <p>
        <Link href="/admin/music">← 楽曲一覧へ戻る</Link>
      </p>
      <h1>楽曲を編集</h1>
      <EditSongForm
        key={song.updated_at}
        songId={song.id}
        initialTitle={song.title}
        initialReleaseDate={song.release_date}
        initialDescription={song.description}
        initialCoverImageKey={song.cover_image_url}
        initialCoverImageUrl={coverImageUrl}
        initialStatus={song.status}
        initialUpdatedAt={song.updated_at}
      />
    </main>
  );
}
