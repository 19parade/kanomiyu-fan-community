import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { SongCoverImage } from "@/components/music/SongCoverImage";
import { getSongImagePublicUrl } from "@/lib/song-images/public-url";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const UUID_SHAPE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

type PublicSongDetail = {
  id: string;
  title: string;
  release_date: string | null;
  cover_image_url: string | null;
  description: string | null;
};

function formatReleaseDate(value: string | null): string {
  if (!value) {
    return "発売日未設定";
  }
  // value is a DB `date` (YYYY-MM-DD) serialized as a plain string — parsed
  // only for display formatting, never sent back anywhere.
  const [year, month, day] = value.split("-").map(Number);
  return `${year}年${month}月${day}日`;
}

/**
 * Fetches the song via the public, anonymous-accessible get_public_song()
 * RPC (S3 — see supabase/migrations/20260928080000_songs_public_detail.sql,
 * unchanged). That RPC itself only ever returns a row when status='public'
 * — a draft id and a nonexistent id are both zero rows, indistinguishable
 * by design (P2 §7). Never calls get_admin_song and never selects from
 * public.songs directly.
 */
async function fetchPublicSong(id: string): Promise<PublicSongDetail | null> {
  if (!UUID_SHAPE.test(id)) {
    return null;
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("get_public_song", { target_song_id: id });

  if (error) {
    console.error("music detail: get_public_song failed", error.message);
    return null;
  }

  const row = Array.isArray(data) ? data[0] : undefined;
  return (row as PublicSongDetail | undefined) ?? null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const song = await fetchPublicSong(id);

  // A draft or nonexistent song's title never reaches metadata (P2 §10) —
  // the generic fallback title is used instead, identical to the
  // not-found page's own wording intent.
  if (!song) {
    return { title: "楽曲が見つかりません" };
  }

  return { title: song.title };
}

/**
 * /music/[id] — public song detail page (P2). Server Component, no admin
 * guard of any kind. Always dynamically rendered: createSupabaseServerClient()
 * reads cookies() (see lib/supabase/server.ts), which this Next.js version
 * already treats as a per-request dynamic API — confirmed empirically via
 * `npm run build`'s route list, where every route using this same client
 * (the existing /admin/* pages) is marked "ƒ" (server-rendered on demand),
 * never "○" (static). This matters specifically for P2 §12: a song that is
 * unpublished after being viewed must not keep serving a cached "public"
 * response to a later visitor — there is no static/ISR caching here to
 * stale on.
 *
 * P3 §4 (real HTTP 404 for draft/nonexistent/invalid ids): this segment
 * deliberately has no loading.tsx of its own, and /music/page.tsx +
 * /music/loading.tsx were moved into the `(list)` route group specifically
 * so that group's Suspense boundary does not extend to this sibling segment
 * (see Next.js's route-groups doc, "Opting specific route segments into
 * sharing a layout, while keeping others out"). With no Suspense boundary
 * anywhere above the notFound() call for this route, Next.js renders this
 * page to completion server-side before the response starts streaming, so
 * a draft/nonexistent/malformed id now gets a genuine HTTP 404 status
 * (confirmed via `curl -i`) instead of the earlier 200-with-noindex "soft
 * 404" — see the local notFound()/loading() docs' own "Status Codes"
 * section for why a Suspense boundary forecloses this. The trade-off is
 * that this page no longer shows an instant loading skeleton while its one
 * RPC call resolves; for a single lightweight query this is the same
 * blocking-render behavior the existing /admin/music/[id] edit page already
 * uses without a loading.tsx.
 */
export default async function SongDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const song = await fetchPublicSong(id);

  if (!song) {
    notFound();
  }

  const supabase = await createSupabaseServerClient();
  const coverImageUrl = getSongImagePublicUrl(supabase, song.cover_image_url);

  return (
    <main className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
      <p className="mb-4">
        <Link href="/music" className="text-sm font-bold text-brand underline-offset-2 hover:underline">
          ← 楽曲一覧へ戻る
        </Link>
      </p>

      <SongCoverImage src={coverImageUrl} alt={`${song.title}のジャケット画像`} />

      <h1 className="mt-6 text-2xl font-bold break-words sm:text-3xl">{song.title}</h1>
      <p className="mt-1 text-sm text-muted">{formatReleaseDate(song.release_date)}</p>

      {song.description ? (
        <p className="mt-6 whitespace-pre-wrap break-words rounded-2xl border border-border bg-surface p-6 text-sm leading-relaxed">
          {song.description}
        </p>
      ) : null}
    </main>
  );
}
