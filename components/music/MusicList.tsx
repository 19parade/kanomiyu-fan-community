"use client";

import Link from "next/link";
import { useCallback, useRef, useState } from "react";

export type PublicSongCard = {
  id: string;
  title: string;
  release_date: string | null;
  // Already resolved to a display URL server-side (never a raw Storage
  // object key) — see app/music/page.tsx and app/api/music/route.ts.
  cover_image_url: string | null;
};

function formatReleaseDate(value: string | null): string {
  return value ?? "発売日未設定";
}

/**
 * Public song listing (P1). Receives the Server Component's initial page as
 * props so the first render needs no client-side fetch; "load more" is
 * handled here against `GET /api/music` (see app/api/music/route.ts).
 *
 * Never calls Supabase directly from the browser — every subsequent read
 * goes through the app's own, intentionally-public Route Handler.
 *
 * Each card links to `/music/[id]` (P2). The whole card is the link (larger
 * tap target on mobile); pagination/"load more" state above is untouched by
 * this change — only the per-card markup gained a wrapping `<Link>`.
 */
export function MusicList({
  initialSongs,
  initialHasMore,
}: {
  initialSongs: PublicSongCard[];
  initialHasMore: boolean;
}) {
  const [songs, setSongs] = useState<PublicSongCard[]>(initialSongs);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [failedImageIds, setFailedImageIds] = useState<Set<string>>(new Set());

  // Guards against a double "load more" click firing two overlapping
  // requests (duplicated/out-of-order appends) — same requestId +
  // AbortController pattern as components/admin/music/MusicAdminList.tsx.
  const requestIdRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  const loadMore = useCallback(async () => {
    const last = songs[songs.length - 1];
    if (!last) {
      return;
    }

    const myRequestId = ++requestIdRef.current;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoadingMore(true);
    setError(null);

    const params = new URLSearchParams();
    params.set("after_id", last.id);
    if (last.release_date !== null) {
      params.set("after_release_date", last.release_date);
    }

    try {
      const response = await fetch(`/api/music?${params.toString()}`, { signal: controller.signal });

      if (myRequestId !== requestIdRef.current) {
        return; // A newer request has since started; discard this result.
      }

      if (!response.ok) {
        console.error("music list: request failed", response.status);
        setError("楽曲一覧の取得に失敗しました。");
        return;
      }

      const body = (await response.json()) as { songs: PublicSongCard[]; has_more: boolean };
      setSongs((previous) => [...previous, ...body.songs]);
      setHasMore(Boolean(body.has_more));
    } catch (fetchError) {
      if ((fetchError as { name?: string }).name === "AbortError") {
        return; // Superseded by a newer request — not a real failure.
      }
      if (myRequestId !== requestIdRef.current) {
        return;
      }
      console.error("music list: fetch threw", fetchError);
      setError("楽曲一覧の取得に失敗しました。");
    } finally {
      if (myRequestId === requestIdRef.current) {
        setLoadingMore(false);
      }
    }
  }, [songs]);

  function handleImageError(id: string) {
    setFailedImageIds((previous) => {
      const next = new Set(previous);
      next.add(id);
      return next;
    });
  }

  if (songs.length === 0) {
    return <p className="mt-6 text-gray-500">楽曲はまだ公開されていません。</p>;
  }

  return (
    <div className="mt-6">
      <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
        {songs.map((song) => (
          <li key={song.id}>
            <Link href={`/music/${song.id}`} className="flex flex-col focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded-md">
              <div className="aspect-square w-full overflow-hidden rounded-md bg-gray-100">
                {song.cover_image_url && !failedImageIds.has(song.id) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={song.cover_image_url}
                    alt={`${song.title}のジャケット画像`}
                    className="h-full w-full object-cover"
                    loading="lazy"
                    onError={() => handleImageError(song.id)}
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-xs text-gray-400">
                    画像なし
                  </div>
                )}
              </div>
              <p className="mt-2 line-clamp-2 break-words text-sm font-medium">{song.title}</p>
              <p className="text-xs text-gray-500">{formatReleaseDate(song.release_date)}</p>
            </Link>
          </li>
        ))}
      </ul>

      {error ? (
        <div role="alert" aria-live="polite" className="mt-4">
          <p className="text-red-600">{error}</p>
          <button
            type="button"
            onClick={loadMore}
            disabled={loadingMore}
            className="mt-2 rounded border px-4 py-2 text-sm"
          >
            再試行
          </button>
        </div>
      ) : null}

      {hasMore ? (
        <div className="mt-6 flex justify-center">
          <button
            type="button"
            onClick={loadMore}
            disabled={loadingMore}
            className="rounded border px-6 py-2 text-sm"
          >
            {loadingMore ? "読み込み中..." : "さらに読み込む"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
