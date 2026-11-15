/**
 * Extracts the numeric video id TikTok's own player iframe needs
 * (`https://www.tiktok.com/player/v1/{id}`) directly from a tiktok.com URL
 * path — no network request, no dependency on TikTok's oEmbed endpoint
 * (lib/links/providers.ts's fetchTikTokPreview() already calls that for the
 * thumbnail/title card, but empirically (confirmed via a direct request,
 * 2026-11-15) it 400s for a `/player/v1/{id}` URL — TikTok's oEmbed only
 * accepts canonical share URLs. Parsing the id straight out of the URL path
 * instead works for every shape a user is realistically going to paste:
 * the share link (`/@user/video/{id}`) and TikTok's own "Embed video" share
 * option's player/embed URLs — all of which already contain the id in
 * plain sight.
 *
 * Deliberately does NOT handle vm.tiktok.com/vt.tiktok.com short links
 * (their id is opaque — would need a redirect-follow or oEmbed round trip
 * to resolve, neither of which this function does); those still fall back
 * to the existing thumbnail-card preview via lib/links/providers.ts.
 *
 * Only ever returns a plain digit string (or null) — this value is
 * interpolated directly into an iframe `src` in
 * components/feed/LinkPreviewCard.tsx, so a strict `/^\d+$/` match (never a
 * looser pattern) is the whole safety boundary for that interpolation.
 */
export function extractTikTokEmbedId(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  const hostname = parsed.hostname.toLowerCase().replace(/^www\./, "");
  if (hostname !== "tiktok.com") {
    return null;
  }

  const patterns = [
    /^\/player\/v\d+\/(\d+)/, // https://www.tiktok.com/player/v1/{id}
    /^\/embed\/v\d+\/(\d+)/, // https://www.tiktok.com/embed/v2/{id}
    /^\/embed\/(\d+)/, // https://www.tiktok.com/embed/{id}
    /^\/@[^/]+\/video\/(\d+)/, // https://www.tiktok.com/@user/video/{id}
  ];

  for (const pattern of patterns) {
    const match = parsed.pathname.match(pattern);
    if (match && /^\d+$/.test(match[1])) {
      return match[1];
    }
  }

  return null;
}
