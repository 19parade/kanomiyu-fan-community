"use client";

import { useState } from "react";

import { AlbumArtPlaceholder } from "@/components/music/AlbumArtPlaceholder";

/**
 * Display-only key-visual image with a placeholder fallback, mirroring
 * components/music/SongCoverImage.tsx. `src` is already a resolved display
 * URL (never a raw Storage object key). Reuses AlbumArtPlaceholder (generic
 * "no image" treatment, not music-specific despite the component name) so
 * LIVE and music share the same empty-image look.
 *
 * The `event-images` Storage bucket does not exist yet (LIVE機能 Phase 1),
 * so any resolved URL will fail to load — this always falls back to the
 * placeholder on `onError`, never showing a broken image icon.
 */
export function EventImage({
  src,
  alt,
  compact = false,
}: {
  src: string | null;
  alt: string;
  compact?: boolean;
}) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return <AlbumArtPlaceholder compact={compact} />;
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      className="h-full w-full object-cover"
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}
