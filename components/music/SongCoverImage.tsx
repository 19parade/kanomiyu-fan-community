"use client";

import { useState } from "react";

/**
 * Display-only cover image with a placeholder fallback (P2). `src` is
 * already a resolved display URL (never a raw Storage object key) — see
 * app/music/[id]/page.tsx. A tiny Client Component only because `onError`
 * needs a browser event handler; the Server Component page above never
 * touches Supabase/Storage from the browser itself.
 */
export function SongCoverImage({ src, alt }: { src: string | null; alt: string }) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <div className="flex aspect-square w-full items-center justify-center rounded-md bg-gray-100 text-sm text-gray-400">
        画像なし
      </div>
    );
  }

  return (
    <div className="aspect-square w-full overflow-hidden rounded-md bg-gray-100">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} className="h-full w-full object-cover" onError={() => setFailed(true)} />
    </div>
  );
}
