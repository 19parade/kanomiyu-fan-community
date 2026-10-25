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

// PM方針 2026-10-25: トップページの運営者からのお知らせ文。改行・絵文字は
// 運営者からの原文のまま、whitespace-pre-wrap で表示する。
const ANNOUNCEMENT_TEXT = `🎉【サイト運営者パレードよりお知らせ】🎉
かのうみゆさんのファンコミュニティサイトを作りました！✨

かのうみゆさんを応援するファンの皆さんが、情報や感動を共有し、もっと交流できる場所にしたいと思っています😊

💭 なぜ、このサイトを作ったのか？
TikTok LIVEなどで皆さんから飛び出す素敵なアイデアや、ライブ後に投稿される熱量たっぷりの感想・レポート。

どれも貴重なのに、SNSや配信など、いろいろな場所に分散してしまっているのが、以前からもったいないなと感じていました。

「ファンの皆さんの想いや情報が集まって、いつでも振り返れる場所があったらいいな」

そんな想いから、このサイトを作りました。

🎵 サイトではこんなことができます！

📅 LIVE情報のチェック
🙋 LIVEへの参加予定の登録
📸 LIVE掲示板で感想や写真を共有
💬 ファン同士で投稿・コメント・交流
🎶 かのうみゆさんの音楽情報をチェック

特にLIVE掲示板では、ライブ前のワクワクも、終演後の興奮も、皆さんで共有できたら嬉しいです！🔥

11月の生誕祭も、ぜひ一緒に盛り上げていきましょう🎂🎉

🚀 サイトはまだまだ成長途中です！

現在、投稿できるのはテキストと画像のみで、動画投稿には対応していません。

これから皆さんのご意見を取り入れながら、少しずつ使いやすく、楽しい場所に育てていきたいと思っています。

気になる点や改善してほしいこと、追加してほしい機能などがあれば、サイト下部の「お問い合わせ」からお気軽にお寄せください🙇

このサイトは個人が運営する非公式ファンコミュニティです。

ファンの皆さんと一緒に作っていく場所にしたいと思っています。

※公式の発表は、必ず かのうみゆさんご本人・所属事務所等の公式情報でご確認ください。`;

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
        <Card className="p-6 sm:p-8">
          <h2 className="text-lg font-bold">ここは、ファンのための場所です</h2>
          <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed text-muted">
            {ANNOUNCEMENT_TEXT}
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
