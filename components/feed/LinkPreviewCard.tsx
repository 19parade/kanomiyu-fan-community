"use client";

import { useState } from "react";

import { extractTikTokEmbedId } from "@/lib/links/tiktokEmbed";
import type { PublicLinkPreview } from "@/lib/posts/types";

const PROVIDER_LABEL: Record<PublicLinkPreview["provider"], string> = {
  youtube: "YouTube",
  tiktok: "TikTok",
  x: "X",
  generic: "リンク",
};

/**
 * TikTok video embed (PM依頼 2026-11-15: 「埋め込んで再生できるように」).
 * Renders TikTok's own official player iframe
 * (`https://www.tiktok.com/player/v1/{id}`) — never the arbitrary HTML a
 * user might paste (that would be a stored-XSS vector); `id` is a plain
 * digit string already validated by extractTikTokEmbedId(), the only thing
 * ever interpolated into the src.
 *
 * `autoplay`/`muted` are deliberately omitted from the pasted embed code's
 * query params — a post list (components/feed/PostCard.tsx) can show
 * several of these at once, and auto-playing every one of them on page
 * load would be poor UX/bandwidth behavior; the viewer presses play
 * themselves, same as every other embed on this site.
 *
 * Sized close to TikTok's own default embed (325×578, a ~9:16 portrait
 * video) but responsive: full width up to that cap, so it never overflows
 * a narrow mobile card.
 */
function TikTokEmbed({ videoId }: { videoId: string }) {
  return (
    <div className="relative z-10 mt-3 w-full max-w-[325px] overflow-hidden rounded-xl border border-border bg-foreground/5">
      <iframe
        src={`https://www.tiktok.com/player/v1/${videoId}?music_info=1&description=1`}
        className="aspect-[325/578] w-full"
        allow="accelerometer; clipboard-write; encrypted-media; fullscreen; gyroscope; picture-in-picture; web-share"
        allowFullScreen
        loading="lazy"
        title="TikTok動画"
      />
    </div>
  );
}

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
 *
 * `preview` may be `null` now (2026-11-15): a TikTok URL that is directly
 * embeddable (extractTikTokEmbedId() succeeds) renders the real player
 * above regardless of whether the oEmbed/OGP preview fetch succeeded —
 * confirmed empirically that TikTok's oEmbed 400s for the `/player/v1/{id}`
 * URL shape, which previously meant this card silently rendered nothing at
 * all for exactly the URL a user gets from TikTok's own "Embed video" share
 * option. Every other provider (and a tiktok.com URL with no extractable
 * id, e.g. a vm.tiktok.com short link) is unaffected — still needs a
 * non-null `preview` and renders the thumbnail card exactly as before.
 */
export function LinkPreviewCard({ url, preview }: { url: string; preview: PublicLinkPreview | null }) {
  const [imageFailed, setImageFailed] = useState(false);

  const tiktokVideoId = extractTikTokEmbedId(url);
  if (tiktokVideoId) {
    return <TikTokEmbed videoId={tiktokVideoId} />;
  }

  if (!preview) {
    return null;
  }

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
