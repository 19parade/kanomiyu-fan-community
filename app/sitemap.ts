import type { MetadataRoute } from "next";

import { SITE_URL } from "@/lib/legal/site-info";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Public song ids/release dates for the sitemap, via the same anonymous-safe
 * get_public_songs() RPC used by /music (S2) — status='public' only, one
 * page at its 100-row max. Revisit with real pagination if the catalog ever
 * exceeds that (unlikely for this site's scale).
 */
async function fetchPublicSongEntries(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>
): Promise<MetadataRoute.Sitemap> {
  const { data, error } = await supabase.rpc("get_public_songs", {
    after_release_date: null,
    after_id: null,
    page_size: 100,
  });

  if (error || !data) {
    return [];
  }

  return (data as { id: string; release_date: string | null }[]).map((song) => ({
    url: `${SITE_URL}/music/${song.id}`,
    lastModified: song.release_date ? new Date(song.release_date) : undefined,
    changeFrequency: "monthly",
    priority: 0.6,
  }));
}

/**
 * Public event ids for the sitemap — same public columns / RLS boundary as
 * /live (events_select_public: status='public' or a published-then-cancelled
 * event). A single query capped well above this site's realistic event
 * count, same reasoning as fetchPublicSongEntries above.
 */
async function fetchPublicEventEntries(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>
): Promise<MetadataRoute.Sitemap> {
  const { data, error } = await supabase.from("events").select("id,event_date").limit(500);

  if (error || !data) {
    return [];
  }

  return (data as { id: string; event_date: string }[]).map((event) => ({
    url: `${SITE_URL}/live/${event.id}`,
    lastModified: new Date(event.event_date),
    changeFrequency: "weekly",
    priority: 0.7,
  }));
}

/**
 * Static top-level routes plus the public LIVE/楽曲 detail pages. Feed posts
 * and fan profiles are intentionally left out — too high-churn (posts can be
 * deleted, profiles can be banned) to be worth listing individually here;
 * their own pages still carry per-page metadata, just not a sitemap entry.
 * Returns an empty list while MAINTENANCE_MODE is on, matching robots.ts
 * (a sitemap pointing at disallowed pages is pointless and confusing).
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const maintenanceMode = process.env.MAINTENANCE_MODE !== "false";
  if (maintenanceMode) {
    return [];
  }

  const supabase = await createSupabaseServerClient();
  const [songEntries, eventEntries] = await Promise.all([
    fetchPublicSongEntries(supabase),
    fetchPublicEventEntries(supabase),
  ]);

  const now = new Date();
  return [
    { url: `${SITE_URL}/`, lastModified: now, changeFrequency: "daily", priority: 1 },
    { url: `${SITE_URL}/live`, lastModified: now, changeFrequency: "daily", priority: 0.9 },
    { url: `${SITE_URL}/profile`, lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { url: `${SITE_URL}/music`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    { url: `${SITE_URL}/feed`, lastModified: now, changeFrequency: "hourly", priority: 0.8 },
    { url: `${SITE_URL}/fans`, lastModified: now, changeFrequency: "daily", priority: 0.5 },
    ...eventEntries,
    ...songEntries,
  ];
}
