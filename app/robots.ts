import type { MetadataRoute } from "next";

/**
 * Tied to the same MAINTENANCE_MODE flag as proxy.ts (default: closed).
 * While the site is gated, every path is disallowed so no crawler indexes
 * it even if it somehow bypassed the gate (e.g. a cached response). Once
 * MAINTENANCE_MODE=false is set for the real launch, this switches to the
 * normal allow-list: public pages open, admin/API/account/legal-draft
 * paths stay closed regardless of launch state.
 */
export default function robots(): MetadataRoute.Robots {
  const maintenanceMode = process.env.MAINTENANCE_MODE !== "false";

  if (maintenanceMode) {
    return {
      rules: { userAgent: "*", disallow: "/" },
    };
  }

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/admin",
        "/admin/",
        "/api/",
        "/me",
        "/account/",
        "/login",
        "/signup",
        "/terms",
        "/privacy",
        "/guidelines",
      ],
    },
    sitemap: "https://kanomiyu-fan.jp/sitemap.xml",
  };
}
