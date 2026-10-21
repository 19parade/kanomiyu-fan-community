import Image from "next/image";
import Link from "next/link";

import { Card } from "@/components/ui/Card";
import { buttonClassName } from "@/components/ui/Button";
import { OPERATOR_NAME, SITE_NAME, UNOFFICIAL_LABEL } from "@/lib/legal/site-info";
import { resolveMemberAccess } from "@/lib/member/access";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Top page (D2, bug-fix pass 2026-10-22). The hero CTA row used to always
 * show 会員登録/ログイン regardless of session state — the same
 * resolveMemberAccess() read used by components/SiteHeader.tsx now decides
 * which buttons this card shows, so a signed-in visitor is not invited to
 * sign up/log in again.
 */
export default async function Home() {
  const supabase = await createSupabaseServerClient();
  const access = await resolveMemberAccess(supabase);
  const isSignedIn = access.kind !== "unauthenticated";

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
            {UNOFFICIAL_LABEL}
          </span>
          <h1 className="mt-3 text-3xl font-bold leading-tight text-white drop-shadow sm:text-4xl">
            {SITE_NAME}
          </h1>
          <p className="mt-2 max-w-md text-sm leading-relaxed text-white/90 drop-shadow">
            かのうみゆさんを応援するファンが集まる、{OPERATOR_NAME}運営の非公式コミュニティです。
          </p>
        </div>
      </section>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:px-6">
        <Card className="p-6 sm:p-8">
          <h2 className="text-lg font-bold">ここは、ファンのための場所です</h2>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            好きな曲の話、LIVEの感想、応援の気持ち。{SITE_NAME}は、かのうみゆさんのファンが
            安心して楽しく過ごせる場所を目指す、個人運営の非公式サイトです。公式の発表は、必ず
            かのうみゆさんご本人・所属事務所等の公式情報でご確認ください。
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/music" className={buttonClassName("primary")}>
              楽曲を見る
            </Link>
            {isSignedIn ? (
              <>
                <Link href="/feed" className={buttonClassName("secondary")}>
                  投稿一覧
                </Link>
                <Link href="/me" className={buttonClassName("ghost")}>
                  マイページ
                </Link>
              </>
            ) : (
              <>
                <Link href="/signup" className={buttonClassName("secondary")}>
                  会員登録
                </Link>
                <Link href="/login" className={buttonClassName("ghost")}>
                  ログイン
                </Link>
              </>
            )}
          </div>
        </Card>

        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          <Card className="p-6">
            <h3 className="font-bold">MUSIC</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              かのうみゆさんの楽曲一覧を公開しています。
            </p>
            <Link href="/music" className="mt-4 inline-block text-sm font-bold text-brand underline underline-offset-2">
              楽曲一覧へ →
            </Link>
          </Card>
          <Card className="p-6">
            <h3 className="font-bold">これから、ここで</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              ファン同士の交流（投稿・コメント）やLIVE情報、ファン一覧は準備中です。公開まで、今しばらくお待ちください。
            </p>
          </Card>
        </div>
      </main>
    </div>
  );
}
