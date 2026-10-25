import type { Metadata } from "next";
import Image from "next/image";

import { SITE_URL } from "@/lib/legal/site-info";
import { buildPageMetadata } from "@/lib/seo/metadata";

const PROFILE_DESCRIPTION = "かのうみゆさんのプロフィールです。生年月日・出身地・経歴などを掲載しています。";

export const metadata: Metadata = buildPageMetadata({
  title: "PROFILE",
  description: PROFILE_DESCRIPTION,
  path: "/profile",
  image: "/images/profile-kanomiyu.jpg",
});

// 運営者から提供されたプロフィール文（原文のまま、whitespace-pre-wrapで改行を保持）。
const PROFILE_BIO = `三重で生まれ、4歳から福岡で育つ。
アメリカのTVドラマ「シークレットアイドル ハンナ・モンタナ」に憧れ、
歌とダンスを独学で始め10歳の頃にギターを手にし、
オリジナル楽曲の制作を始める。2018年に上京。`;

const PROFILE_FACTS: { label: string; value: string }[] = [
  { label: "生年月日", value: "1999年11月6日" },
  { label: "出身地", value: "福岡県大牟田市 出身" },
  { label: "身長", value: "159cm" },
  { label: "靴のサイズ", value: "23.5cm" },
  { label: "特技", value: "フラフープを永遠に回せる、ギターのカッティング" },
  { label: "趣味", value: "散歩・ウインドウショッピング" },
  { label: "スポーツ", value: "キックボクシング、ピラティス" },
];

// Person JSON-LD: restates only the facts already shown in plain text below
// (same pattern as /live/[id]'s MusicEvent and /music/[id]'s MusicRecording
// schemas) — never asserts anything beyond what this page itself publishes.
const PROFILE_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "Person",
  name: "かのうみゆ",
  url: `${SITE_URL}/profile`,
  image: `${SITE_URL}/images/profile-kanomiyu.jpg`,
  birthDate: "1999-11-06",
  birthPlace: "福岡県大牟田市",
  height: "159cm",
  description: PROFILE_DESCRIPTION,
};

/**
 * /profile — public かのうみゆ profile page. Static content page (no
 * Supabase read): every field here is operator-authored copy, not
 * user/DB-generated data, so this mirrors app/terms(/privacy/guidelines)'s
 * plain static-page pattern rather than the DB-backed /live, /music pages.
 */
export default function ProfilePage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
      <script
        type="application/ld+json"
        // Built entirely from this page's own static, operator-authored copy — no user input.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(PROFILE_JSON_LD) }}
      />

      <div className="mx-auto w-full max-w-sm overflow-hidden rounded-2xl border border-border bg-surface">
        <Image
          src="/images/profile-kanomiyu.jpg"
          alt="かのうみゆ プロフィール写真"
          width={643}
          height={535}
          priority
          className="h-auto w-full object-cover"
        />
      </div>

      <h1 className="mt-6 text-center text-3xl font-bold">かのうみゆ</h1>

      <p className="mt-6 whitespace-pre-wrap break-words text-center text-sm leading-relaxed text-muted">
        {PROFILE_BIO}
      </p>

      <dl className="mt-8 grid grid-cols-1 gap-3 rounded-2xl border border-border bg-surface p-5 text-sm sm:grid-cols-2">
        {PROFILE_FACTS.map((fact) => (
          <div key={fact.label}>
            <dt className="font-bold text-muted">{fact.label}</dt>
            <dd className="mt-0.5">{fact.value}</dd>
          </div>
        ))}
      </dl>

      <p className="mt-8 text-xs text-muted">
        ※公式の発表は、必ずかのうみゆさんご本人・所属事務所等の公式情報でご確認ください。
      </p>
    </main>
  );
}
