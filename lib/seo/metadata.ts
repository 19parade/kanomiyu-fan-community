import type { Metadata } from "next";

import { SITE_NAME } from "@/lib/legal/site-info";

const DEFAULT_IMAGE = "/images/hero-kanomiyu.jpg";

/**
 * Builds a page's full `openGraph`/`twitter`/`alternates` metadata in one
 * shot. Next.js merges `Metadata` objects shallowly — a page that sets its
 * own `openGraph` (even just `{ title, description }`) replaces the parent
 * layout's entire `openGraph` object wholesale, silently dropping fields
 * like `type`/`siteName`/`images` that only the parent set (confirmed by
 * inspecting the rendered <head> of "/" after adding its own partial
 * `openGraph` override — og:image and the twitter "summary_large_image"
 * card both disappeared). Every page-level override must therefore restate
 * the full object; this helper is the one place that does, so no call site
 * can accidentally drop a field again.
 */
export function buildPageMetadata({
  title,
  description,
  path,
  image,
}: {
  title?: string;
  description: string;
  path: string;
  image?: string | null;
}): Metadata {
  const resolvedTitle = title ?? SITE_NAME;
  const images = image ? [image] : [DEFAULT_IMAGE];

  return {
    // Omitted (not `title: undefined`) when the caller passes no title, so
    // the root layout's `title.default` (plain SITE_NAME, no template) is
    // used as-is — a plain string here would instead go through the
    // layout's `%s | ${SITE_NAME}` template and double up the site name.
    ...(title ? { title } : {}),
    description,
    alternates: {
      canonical: path,
    },
    openGraph: {
      type: "website",
      locale: "ja_JP",
      siteName: SITE_NAME,
      url: path,
      title: resolvedTitle,
      description,
      images,
    },
    twitter: {
      card: "summary_large_image",
      title: resolvedTitle,
      description,
      images,
    },
  };
}
