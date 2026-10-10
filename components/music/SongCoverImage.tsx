"use client";

import { useState } from "react";

import { AlbumArtPlaceholder } from "./AlbumArtPlaceholder";

/**
 * Display-only cover image with a placeholder fallback (P2). `src` is
 * already a resolved display URL (never a raw Storage object key) — see
 * app/music/[id]/page.tsx. A tiny Client Component only because `onError`
 * needs a browser event handler; the Server Component page above never
 * touches Supabase/Storage from the browser itself.
 *
 * D3: re-skinned to the warm-minimal tokens (rounded-2xl, border-border,
 * bg-surface) and the shared AlbumArtPlaceholder — the `src`/`onError`
 * contract and the plain <img> (not next/image; this URL is a remote
 * Supabase Storage URL, and adding a remote image-optimizer domain is left
 * for a separate, deliberate decision — see the D3 report) are unchanged.
 */
export function SongCoverImage({ src, alt }: { src: string | null; alt: string }) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <div className="aspect-square w-full overflow-hidden rounded-2xl border border-border">
        <AlbumArtPlaceholder />
      </div>
    );
  }

  return (
    <div className="aspect-square w-full overflow-hidden rounded-2xl border border-border bg-surface">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} className="h-full w-full object-cover" onError={() => setFailed(true)} />
    </div>
  );
}
