import { safeFetch, UnsafeUrlError } from "@/lib/links/safeFetch";

export type LinkPreviewProvider = "youtube" | "tiktok" | "x" | "generic";

export type LinkPreviewResult =
  | {
      status: "ok";
      provider: LinkPreviewProvider;
      title: string | null;
      description: string | null;
      imageUrl: string | null;
      siteName: string | null;
    }
  | { status: "error"; provider: LinkPreviewProvider };

export function detectProvider(url: string): LinkPreviewProvider {
  let hostname: string;
  try {
    hostname = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "generic";
  }

  if (hostname === "youtube.com" || hostname === "m.youtube.com" || hostname === "youtu.be") {
    return "youtube";
  }
  if (hostname === "tiktok.com" || hostname === "vm.tiktok.com" || hostname === "vt.tiktok.com") {
    return "tiktok";
  }
  if (hostname === "twitter.com" || hostname === "x.com") {
    return "x";
  }
  return "generic";
}

function extractYouTubeVideoId(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const hostname = parsed.hostname.toLowerCase().replace(/^www\./, "");

  if (hostname === "youtu.be") {
    return parsed.pathname.slice(1).split("/")[0] || null;
  }
  if (hostname === "youtube.com" || hostname === "m.youtube.com") {
    if (parsed.pathname === "/watch") {
      return parsed.searchParams.get("v");
    }
    const shortsMatch = parsed.pathname.match(/^\/shorts\/([^/]+)/);
    if (shortsMatch) return shortsMatch[1];
    const embedMatch = parsed.pathname.match(/^\/embed\/([^/]+)/);
    if (embedMatch) return embedMatch[1];
  }
  return null;
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&apos;/g, "'");
}

/**
 * Lightweight regex-based OGP meta-tag extractor — intentionally not a full
 * HTML/DOM parser (no new dependency for just reading a handful of known
 * <meta> tag shapes). Tries both attribute orders and either quote style.
 */
function extractMetaContent(html: string, names: string[]): string | null {
  for (const name of names) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const patterns = [
      new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]*content=["']([^"']*)["']`, "i"),
      new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${escaped}["']`, "i"),
    ];
    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match?.[1]) {
        return decodeHtmlEntities(match[1]).trim();
      }
    }
  }
  return null;
}

function extractTitleTag(html: string): string | null {
  const match = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  return match ? decodeHtmlEntities(match[1]).trim() : null;
}

function resolveMaybeRelativeUrl(value: string | null, base: string): string | null {
  if (!value) return null;
  try {
    return new URL(value, base).toString();
  } catch {
    return null;
  }
}

/** Generic OGP scrape of an arbitrary (already SSRF-validated by safeFetch) URL. */
async function scrapeOgp(url: string): Promise<LinkPreviewResult> {
  try {
    const { body, finalUrl } = await safeFetch(url);
    const title = extractMetaContent(body, ["og:title", "twitter:title"]) ?? extractTitleTag(body);
    const description = extractMetaContent(body, ["og:description", "description", "twitter:description"]);
    const imageUrl = resolveMaybeRelativeUrl(
      extractMetaContent(body, ["og:image", "og:image:secure_url", "twitter:image"]),
      finalUrl
    );
    const siteName = extractMetaContent(body, ["og:site_name"]);

    if (!title && !imageUrl) {
      return { status: "error", provider: "generic" };
    }

    return { status: "ok", provider: "generic", title, description, imageUrl, siteName };
  } catch (error) {
    if (!(error instanceof UnsafeUrlError)) {
      console.error("link-preview: generic OGP scrape threw unexpectedly", error);
    }
    return { status: "error", provider: "generic" };
  }
}

async function fetchYouTubePreview(url: string): Promise<LinkPreviewResult> {
  const videoId = extractYouTubeVideoId(url);
  if (!videoId) {
    return { status: "error", provider: "youtube" };
  }

  // Deterministic, no network request of its own — YouTube serves a
  // thumbnail at this fixed path for every public video id.
  const imageUrl = `https://i.ytimg.com/vi/${encodeURIComponent(videoId)}/hqdefault.jpg`;

  try {
    const oembedUrl = `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(
      `https://www.youtube.com/watch?v=${videoId}`
    )}`;
    const { body } = await safeFetch(oembedUrl);
    const data = JSON.parse(body) as { title?: string; author_name?: string };
    return {
      status: "ok",
      provider: "youtube",
      title: data.title ?? null,
      description: data.author_name ? `${data.author_name} さんの動画` : null,
      imageUrl,
      siteName: "YouTube",
    };
  } catch {
    // oEmbed can fail (deleted/private video, transient error) even when the
    // thumbnail path above still resolves — still worth showing the image alone.
    return { status: "ok", provider: "youtube", title: null, description: null, imageUrl, siteName: "YouTube" };
  }
}

async function fetchTikTokPreview(url: string): Promise<LinkPreviewResult> {
  let title: string | null = null;
  let description: string | null = null;
  let imageUrl: string | null = null;

  try {
    const oembedUrl = `https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`;
    const { body } = await safeFetch(oembedUrl);
    const data = JSON.parse(body) as { title?: string; thumbnail_url?: string; author_name?: string };
    title = data.title ?? null;
    description = data.author_name ? `@${data.author_name}` : null;
    imageUrl = data.thumbnail_url ?? null;
  } catch {
    // oEmbed is best-effort — TikTok's public oEmbed response does not
    // reliably include `title`/`thumbnail_url` for every video (confirmed
    // empirically, 2026-10-27: several real video ids returned only embed
    // html, no thumbnail at all). Fall through to the generic OGP scrape
    // below regardless.
  }

  if (!imageUrl) {
    const scraped = await scrapeOgp(url);
    if (scraped.status === "ok") {
      title = title ?? scraped.title;
      description = description ?? scraped.description;
      imageUrl = scraped.imageUrl;
    }
  }

  if (!title && !imageUrl) {
    return { status: "error", provider: "tiktok" };
  }

  return { status: "ok", provider: "tiktok", title, description, imageUrl, siteName: "TikTok" };
}

async function fetchXPreview(url: string): Promise<LinkPreviewResult> {
  let title: string | null = null;
  let description: string | null = null;

  try {
    const oembedUrl = `https://publish.twitter.com/oembed?omit_script=true&url=${encodeURIComponent(url)}`;
    const { body } = await safeFetch(oembedUrl);
    const data = JSON.parse(body) as { author_name?: string };
    if (data.author_name) {
      title = `${data.author_name} さんの投稿`;
    }
  } catch {
    // oEmbed is best-effort for X — fall through to the generic scrape below
    // regardless, which may still produce a usable title.
  }

  // X's own oEmbed response never includes a thumbnail_url — attempt a
  // best-effort generic OGP scrape of the tweet itself for an image. Not
  // guaranteed to succeed (X's markup for non-Twitterbot user agents is
  // inconsistent) — a missing image here is an accepted limitation, not a
  // bug, per the 2026-10-27 design review.
  const scraped = await scrapeOgp(url);
  if (scraped.status === "ok") {
    title = title ?? scraped.title;
    description = scraped.description;
    if (scraped.imageUrl || title) {
      return {
        status: "ok",
        provider: "x",
        title,
        description,
        imageUrl: scraped.imageUrl,
        siteName: "X",
      };
    }
  }

  if (title) {
    return { status: "ok", provider: "x", title, description, imageUrl: null, siteName: "X" };
  }

  return { status: "error", provider: "x" };
}

export async function fetchLinkPreview(url: string): Promise<LinkPreviewResult> {
  const provider = detectProvider(url);

  switch (provider) {
    case "youtube":
      return fetchYouTubePreview(url);
    case "tiktok":
      return fetchTikTokPreview(url);
    case "x":
      return fetchXPreview(url);
    case "generic":
      return scrapeOgp(url);
  }
}
