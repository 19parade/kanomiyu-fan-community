import type { SupabaseClient } from "@supabase/supabase-js";

import { extractFirstUrl } from "@/lib/links/extract";
import type { PublicLinkPreview } from "@/lib/posts/types";

type LinkPreviewCacheRow = {
  url: string;
  provider: string;
  title: string | null;
  description: string | null;
  image_url: string | null;
  site_name: string | null;
};

function toPublicLinkPreview(row: LinkPreviewCacheRow): PublicLinkPreview {
  const provider =
    row.provider === "youtube" || row.provider === "tiktok" || row.provider === "x" ? row.provider : "generic";
  return {
    provider,
    title: row.title,
    description: row.description,
    imageUrl: row.image_url,
    siteName: row.site_name,
  };
}

/**
 * Batch-resolves cached link previews for a set of already-extracted first
 * URLs, mirroring lib/posts/authors.ts's fetchAuthorsByIds() shape (one
 * round trip, a Map keyed for O(1) lookup, degrades to an empty map on
 * failure rather than throwing — a missing preview is never worse than "no
 * preview shown", unlike a missing author which F5-D1b treats as a real
 * failure).
 */
export async function fetchLinkPreviewsByUrls(
  supabase: SupabaseClient,
  urls: (string | null)[]
): Promise<Map<string, PublicLinkPreview>> {
  const unique = Array.from(new Set(urls.filter((url): url is string => Boolean(url))));
  if (unique.length === 0) {
    return new Map();
  }

  const { data, error } = await supabase
    .from("link_previews")
    .select("url,provider,title,description,image_url,site_name")
    .in("url", unique)
    .eq("status", "ok");

  if (error) {
    console.error("link previews: batch lookup failed", error.message);
    return new Map();
  }

  const map = new Map<string, PublicLinkPreview>();
  for (const row of (data ?? []) as LinkPreviewCacheRow[]) {
    map.set(row.url, toPublicLinkPreview(row));
  }
  return map;
}

/** Convenience wrapper: extracts the first URL from each row's full content, then resolves previews for all of them in one round trip. */
export async function fetchLinkPreviewsForContents(
  supabase: SupabaseClient,
  contents: string[]
): Promise<Map<string, PublicLinkPreview>> {
  return fetchLinkPreviewsByUrls(supabase, contents.map(extractFirstUrl));
}
