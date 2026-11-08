import type { Metadata } from "next";

import { OPERATOR_NAME, SITE_NAME, SITE_URL } from "@/lib/legal/site-info";

const DEFAULT_IMAGE = "/images/hero-kanomiyu.jpg";

// SEO改善（2026-11-08付PM方針）: かのうみゆさん本人・運営者それぞれの
// JSON-LDエンティティを、サイト全体でこの1箇所だけで定義する。
// app/layout.tsxのサイト全体JSON-LD（@graphの実体そのもの）と、
// app/live/[id]/page.tsx・app/music/[id]/page.tsxの個別ページJSON-LD
// （`{"@id": KANOMIYU_PERSON_ID}`という参照のみ）の両方がこれを使う —
// 同じ@id文字列を複数箇所に直接書くと将来の変更時に食い違う危険が
// あるため、定数として一元化する。
export const KANOMIYU_PERSON_ID = `${SITE_URL}/#kanomiyu`;
export const OPERATOR_ORGANIZATION_ID = `${SITE_URL}/#organization`;

// sameAs先はいずれもかのうみゆさんご本人の公開済み公式アカウント
// （競合サイトkanomiyu.comのJSON-LDで公開されている情報と同一）であり、
// 新規に何かを主張・作成するものではない。
export const KANOMIYU_PERSON_JSON_LD = {
  "@type": "Person",
  "@id": KANOMIYU_PERSON_ID,
  name: "かのうみゆ",
  alternateName: ["かのう みゆ", "KANO MIYU", "Kano Miyu", "Kanou Miyu", "카노미유", "카노우 미유"],
  sameAs: [
    "https://www.instagram.com/miyu_allright/",
    "https://www.tiktok.com/@miyu_allright",
    "https://x.com/miyu_allright",
    "https://www.youtube.com/channel/UCIPBUGqKm4BEEoeJQGiX3Sw",
  ],
};

export const OPERATOR_ORGANIZATION_JSON_LD = {
  "@type": "Organization",
  "@id": OPERATOR_ORGANIZATION_ID,
  name: OPERATOR_NAME,
};

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
