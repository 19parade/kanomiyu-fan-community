import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import { Card } from "@/components/ui/Card";
import { SITE_NAME } from "@/lib/legal/site-info";
import { buildPageMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = buildPageMetadata({
  description:
    "かのうみゆさんのLIVE情報・楽曲情報をまとめた非公式ファンコミュニティ。LIVEの参加表明やレポート共有、ファン同士の投稿・交流ができます。",
  path: "/",
});

// PM方針 2026-10-25: トップページの運営者からのお知らせ文。文言は運営者から
// の原文のまま一言一句変更しない — 2026-10-31のデザイン改修で、従来の単一
// whitespace-pre-wrap ブロックから、見出し単位の構造化ブロックに分割した
// （Apple社iPhoneページのような「見出し→本文→次のセクション」のリズムを
// 参考に、写真を交えた構成にするため）。各定数の文字列は元の
// ANNOUNCEMENT_TEXT から改行・絵文字も含め一切変更せずそのまま抜き出した
// ものであり、内容・言い回しの変更は行っていない。
const ANNOUNCEMENT_INTRO = `🎉【サイト運営者パレードよりお知らせ】🎉
かのうみゆさんのファンコミュニティサイトを作りました！✨`;

const ANNOUNCEMENT_MISSION =
  "かのうみゆさんを応援するファンの皆さんが、情報や感動を共有し、もっと交流できる場所にしたいと思っています😊";

const ANNOUNCEMENT_WHY_HEADING = "💭 なぜ、このサイトを作ったのか？";
const ANNOUNCEMENT_WHY_BODY = `TikTok LIVEなどで皆さんから飛び出す素敵なアイデアや、ライブ後に投稿される熱量たっぷりの感想・レポート。

どれも貴重なのに、SNSや配信など、いろいろな場所に分散してしまっているのが、以前からもったいないなと感じていました。

「ファンの皆さんの想いや情報が集まって、いつでも振り返れる場所があったらいいな」

そんな想いから、このサイトを作りました。`;

const ANNOUNCEMENT_FEATURES_HEADING = "🎵 サイトではこんなことができます！";
const ANNOUNCEMENT_FEATURES: { emoji: string; label: string }[] = [
  { emoji: "📅", label: "LIVE情報のチェック" },
  { emoji: "🙋", label: "LIVEへの参加予定の登録" },
  { emoji: "📸", label: "LIVE掲示板で感想や写真を共有" },
  { emoji: "💬", label: "ファン同士で投稿・コメント・交流" },
  { emoji: "🎶", label: "かのうみゆさんの音楽情報をチェック" },
];

const ANNOUNCEMENT_LIVE_BOARD_HIGHLIGHT =
  "特にLIVE掲示板では、ライブ前のワクワクも、終演後の興奮も、皆さんで共有できたら嬉しいです！🔥";
const ANNOUNCEMENT_BIRTHDAY_CTA = "11月の生誕祭も、ぜひ一緒に盛り上げていきましょう🎂🎉";

const ANNOUNCEMENT_GROWTH_HEADING = "🚀 サイトはまだまだ成長途中です！";
const ANNOUNCEMENT_GROWTH_BODY = `現在、投稿できるのはテキストと画像のみで、動画投稿には対応していません。

これから皆さんのご意見を取り入れながら、少しずつ使いやすく、楽しい場所に育てていきたいと思っています。

気になる点や改善してほしいこと、追加してほしい機能などがあれば、サイト下部の「お問い合わせ」からお気軽にお寄せください🙇`;

const ANNOUNCEMENT_CLOSING = `このサイトは個人が運営する非公式ファンコミュニティです。

ファンの皆さんと一緒に作っていく場所にしたいと思っています。`;

const ANNOUNCEMENT_DISCLAIMER =
  "※公式の発表は、必ず かのうみゆさんご本人・所属事務所等の公式情報でご確認ください。";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col">
      <section className="relative overflow-hidden sm:mx-4 sm:mt-4 sm:rounded-3xl">
        <div className="relative aspect-[3/4] w-full sm:aspect-[16/9] lg:aspect-[21/9]">
          <Image
            src="/images/hero-kanomiyu.jpg"
            alt="ステージで観客に手を振るかのうみゆさん"
            fill
            priority
            sizes="100vw"
            className="object-cover object-[50%_20%]"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
        </div>

        <div className="absolute inset-x-0 bottom-0 px-4 pb-6 sm:px-8 sm:pb-8">
          <span className="inline-block rounded-full bg-black/50 px-3 py-1 text-xs font-bold text-white backdrop-blur-sm">
            非公式ファンコミュニティ
          </span>
          <h1 className="mt-3 text-3xl font-bold leading-tight text-white drop-shadow sm:text-4xl">
            {SITE_NAME}
          </h1>
          <p className="mt-2 max-w-md text-sm leading-relaxed text-white/90 drop-shadow">
            かのうみゆさんを応援するファンが集まるコミュニティです。
          </p>
        </div>
      </section>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:px-6">
        <Card className="overflow-hidden p-6 sm:p-8">
          {/* Apple社iPhoneページ風の「大見出し→短い補足文」のリズムを、
              サイト既存の暖色パレード(D2トークン)の範囲内で採用。文言は
              ANNOUNCEMENT_INTRO/MISSIONそのまま、文字サイズと余白のみ変更。 */}
          <h2 className="text-2xl font-bold leading-tight sm:text-3xl">ここは、ファンのための場所です</h2>
          <p className="mt-4 whitespace-pre-wrap break-words text-sm leading-relaxed text-muted">
            {ANNOUNCEMENT_INTRO}
          </p>
          <p className="mt-3 max-w-xl whitespace-pre-wrap break-words text-base leading-relaxed">
            {ANNOUNCEMENT_MISSION}
          </p>

          {/* Apple社のフルブリード・バナーに相当する「写真だけの小休止」
              セクション。テキストは重ねず、次の「なぜ作ったか」への導入
              として写真そのものを見せる。 */}
          <div className="relative -mx-6 mt-8 aspect-[16/9] overflow-hidden sm:-mx-8 sm:rounded-2xl">
            <Image
              src="/images/live-stage-wide.jpg"
              alt="かのうみゆさんのLIVEステージとオーディエンス"
              fill
              sizes="(min-width: 640px) 672px, 100vw"
              className="object-cover object-[50%_35%]"
            />
          </div>

          <div className="mt-8">
            <h3 className="text-xl font-bold leading-tight">{ANNOUNCEMENT_WHY_HEADING}</h3>
            <p className="mt-3 max-w-xl whitespace-pre-wrap break-words text-sm leading-relaxed text-muted">
              {ANNOUNCEMENT_WHY_BODY}
            </p>
          </div>

          {/* Apple社の「アイコン+短いラベル」のインセンティブモジュールを
              参考にしたグリッド。絵文字は運営者の原文のままアイコンとして
              使い、ラベル文言も完全に一致させている。 */}
          <div className="mt-8">
            <h3 className="text-xl font-bold leading-tight">{ANNOUNCEMENT_FEATURES_HEADING}</h3>
            <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {ANNOUNCEMENT_FEATURES.map((feature) => (
                <li
                  key={feature.label}
                  className="rounded-xl border border-border bg-background p-4 text-center sm:p-5"
                >
                  <span className="text-2xl" aria-hidden="true">
                    {feature.emoji}
                  </span>
                  <p className="mt-2 text-xs font-bold leading-snug sm:text-sm">{feature.label}</p>
                </li>
              ))}
            </ul>
          </div>

          {/* Apple社の「写真+テキスト」フィーチャー行を参考に、LIVE掲示板
              への導線になっている一文と2枚目の写真を横並びにした。 */}
          <div className="mt-8 grid items-center gap-5 sm:grid-cols-2">
            <div className="relative aspect-[4/5] overflow-hidden rounded-2xl">
              <Image
                src="/images/live-vocal-closeup.jpg"
                alt="LIVEで歌うかのうみゆさん"
                fill
                sizes="(min-width: 640px) 320px, 100vw"
                className="object-cover object-[50%_25%]"
              />
            </div>
            <div>
              <p className="whitespace-pre-wrap break-words text-base font-bold leading-relaxed text-accent">
                {ANNOUNCEMENT_LIVE_BOARD_HIGHLIGHT}
              </p>
              <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed text-muted">
                {ANNOUNCEMENT_BIRTHDAY_CTA}
              </p>
            </div>
          </div>

          {/* 成長途中であることの案内とクロージングは、Apple社ページの
              脚注的な落ち着いたトーンを参考に、背景色を一段抑えた
              bg-background のブロックにして視覚的な重みを下げている。 */}
          <div className="mt-8 rounded-2xl bg-background p-5 sm:p-6">
            <h3 className="font-bold">{ANNOUNCEMENT_GROWTH_HEADING}</h3>
            <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed text-muted">
              {ANNOUNCEMENT_GROWTH_BODY}
            </p>
            <p className="mt-4 whitespace-pre-wrap break-words text-sm leading-relaxed text-muted">
              {ANNOUNCEMENT_CLOSING}
            </p>
          </div>

          <p className="mt-6 whitespace-pre-wrap break-words text-xs leading-relaxed text-muted">
            {ANNOUNCEMENT_DISCLAIMER}
          </p>
        </Card>

        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          <Card className="border-2 border-brand/30 p-6">
            <h3 className="font-bold text-brand">LIVE</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              開催予定・開催終了のLIVE情報を公開しています。
            </p>
            <Link href="/live" className="mt-4 inline-block text-sm font-bold text-brand underline underline-offset-2">
              LIVE一覧へ →
            </Link>
          </Card>
          <Card className="p-6">
            <h3 className="font-bold">MUSIC</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              かのうみゆさんの楽曲一覧を公開しています。
            </p>
            <Link href="/music" className="mt-4 inline-block text-sm font-bold text-brand underline underline-offset-2">
              楽曲一覧へ →
            </Link>
          </Card>
        </div>

        <Card className="mt-4 p-6">
          <h3 className="font-bold">PROFILE</h3>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            かのうみゆさんのプロフィールを掲載しています。
          </p>
          <Link href="/profile" className="mt-4 inline-block text-sm font-bold text-brand underline underline-offset-2">
            プロフィールへ →
          </Link>
        </Card>
      </main>
    </div>
  );
}
