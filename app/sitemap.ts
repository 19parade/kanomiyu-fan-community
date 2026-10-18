import type { MetadataRoute } from "next";

const SITE_URL = "https://kanomiyu-fan.jp";

/**
 * Static top-level routes only. Dynamic listings (individual posts/songs)
 * are intentionally left out for the initial launch — revisit once those
 * pages are stable and worth surfacing to search engines individually.
 * Returns an empty list while MAINTENANCE_MODE is on, matching robots.ts
 * (a sitemap pointing at disallowed pages is pointless and confusing).
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const maintenanceMode = process.env.MAINTENANCE_MODE !== "false";
  if (maintenanceMode) {
    return [];
  }

  const now = new Date();
  return [
    { url: `${SITE_URL}/`, lastModified: now, changeFrequency: "daily", priority: 1 },
    { url: `${SITE_URL}/music`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    { url: `${SITE_URL}/feed`, lastModified: now, changeFrequency: "hourly", priority: 0.8 },
    { url: `${SITE_URL}/fans`, lastModified: now, changeFrequency: "daily", priority: 0.5 },
  ];
}
