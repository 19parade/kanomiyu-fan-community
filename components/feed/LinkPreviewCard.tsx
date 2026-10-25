"use client";

import { useState } from "react";

import type { PublicLinkPreview } from "@/lib/posts/types";

const PROVIDER_LABEL: Record<PublicLinkPreview["provider"], string> = {
  youtube: "YouTube",
  tiktok: "TikTok",
  x: "X",
  generic: "リンク",
};

/**
 * Rich link preview card for the first URL in a post's content (2026-10-27
 * design review). `relative z-10` is unconditional for the same reason as
 * components/feed/PostContentText.tsx's inline links — this card is itself
 * a real `<a>` to the *external* site (not the post's own detail page), so
 * it must sit above components/feed/PostCard.tsx's full-card overlay link
 * when rendered inside a list card; it is a harmless no-op on the detail
 * page, which has no competing overlay.
 *
 * Thumbnails come from arbitrary external hosts (YouTube/TikTok/news
 * sites/etc.), so this intentionally uses a plain `<img>` rather than
 * next/image (which requires each remote domain to be allow-listed ahead
 * of time) — same reasoning and fallback-on-error pattern as
 * components/live/EventImage.tsx / components/music/SongCoverImage.tsx.
 */
export function LinkPreviewCard({ url, preview }: { url: string; preview: PublicLinkPreview }) {
  const [imageFailed, setImageFailed] = useState(false);
  const showImage = Boolean(preview.imageUrl) && !imageFailed;

  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer noopener"
      className="relative z-10 mt-3 flex overflow-hidden rounded-xl border border-border bg-background transition-colors hover:bg-foreground/5"
    >
      {showImage ? (
        <div className="aspect-square w-24 shrink-0 overflow-hidden bg-foreground/5 sm:w-32">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={preview.imageUrl ?? undefined}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
            className="h-full w-full object-cover"
            onError={() => setImageFailed(true)}
          />
        </div>
      ) : null}
      <div className="min-w-0 flex-1 px-3 py-2">
        <p className="text-xs font-bold text-muted">{preview.siteName || PROVIDER_LABEL[preview.provider]}</p>
        <p className="mt-0.5 line-clamp-2 break-words text-sm font-bold">{preview.title ?? url}</p>
      </div>
    </a>
  );
}
