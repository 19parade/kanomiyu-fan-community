import type { Metadata } from "next";
import { headers } from "next/headers";
import Script from "next/script";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { SITE_NAME, SITE_URL } from "@/lib/legal/site-info";

const GTM_CONTAINER_ID = "GTM-KQPQFW8W";

// GTM bootstrap script, verbatim from Google Tag Manager's own install
// snippet except for formatting. Never fetched/executed on /admin/* — see
// isAdminRoute below.
const GTM_SCRIPT = `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','${GTM_CONTAINER_ID}');`;

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const SITE_DESCRIPTION =
  `${SITE_NAME}は、かのうみゆさんを応援するファンのための非公式コミュニティです。LIVE情報・楽曲情報の閲覧や、ファン同士の投稿・交流ができます。`;

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: SITE_NAME,
    template: `%s | ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    locale: "ja_JP",
    url: "/",
    siteName: SITE_NAME,
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
    images: [
      {
        url: "/images/hero-kanomiyu.jpg",
        width: 1200,
        height: 630,
        alt: SITE_NAME,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
    images: ["/images/hero-kanomiyu.jpg"],
  },
};

const WEBSITE_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: SITE_NAME,
  url: SITE_URL,
  description: SITE_DESCRIPTION,
  inLanguage: "ja",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Set by proxy.ts on every request (x-pathname) — this layout has no
  // router access of its own (it is the root, a Server Component). GTM is
  // measurement for the public site only; /admin/* is explicitly excluded
  // per PM方針 2026-10-24, same prefix check as proxy.ts's own admin guard.
  const pathname = (await headers()).get("x-pathname") ?? "";
  const isAdminRoute = pathname === "/admin" || pathname.startsWith("/admin/");

  return (
    <html
      lang="ja"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {!isAdminRoute ? (
          <noscript>
            {/* Google Tag Manager (noscript) */}
            <iframe
              src={`https://www.googletagmanager.com/ns.html?id=${GTM_CONTAINER_ID}`}
              height="0"
              width="0"
              style={{ display: "none", visibility: "hidden" }}
            />
            {/* End Google Tag Manager (noscript) */}
          </noscript>
        ) : null}
        <script
          type="application/ld+json"
          // Static, hand-authored JSON (no user input) — safe to inline.
          dangerouslySetInnerHTML={{ __html: JSON.stringify(WEBSITE_JSON_LD) }}
        />
        <SiteHeader />
        {children}
        <SiteFooter />
        {!isAdminRoute ? (
          // strategy="beforeInteractive" is always injected into <head>
          // regardless of where it's placed in the tree (Next.js's own
          // documented guarantee) — this is the framework-correct
          // replacement for manually pasting the GTM snippet high in <head>.
          <Script id="gtm-base" strategy="beforeInteractive">
            {GTM_SCRIPT}
          </Script>
        ) : null}
      </body>
    </html>
  );
}
