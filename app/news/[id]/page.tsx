import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { formatNewsDate } from "@/lib/news/format";
import { isExternalNewsLink } from "@/lib/news/link";
import { buildPageMetadata } from "@/lib/seo/metadata";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const UUID_SHAPE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

type PublicNewsDetail = {
  id: string;
  title: string;
  content: string;
  source_url: string | null;
  published_at: string;
};

/**
 * Fetches the news item via the public, anonymous-accessible
 * get_public_news_item() RPC (see supabase/migrations/20261108020000_
 * news_public_detail.sql). That RPC itself only ever returns a row when
 * status='published' AND published_at<=now() AND content IS NOT NULL — a
 * draft id, a future-dated id, a link-only (no content) id, and a
 * nonexistent id are all zero rows, indistinguishable by design (same
 * approach as app/music/[id]/page.tsx's fetchPublicSong()).
 */
async function fetchPublicNewsItem(id: string): Promise<PublicNewsDetail | null> {
  if (!UUID_SHAPE.test(id)) {
    return null;
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("get_public_news_item", { target_news_id: id });

  if (error) {
    console.error("news detail: get_public_news_item failed", error.message);
    return null;
  }

  const row = Array.isArray(data) ? data[0] : undefined;
  return (row as PublicNewsDetail | undefined) ?? null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const news = await fetchPublicNewsItem(id);

  if (!news) {
    return { title: "お知らせが見つかりません" };
  }

  return buildPageMetadata({
    title: news.title,
    description: news.content.slice(0, 120),
    path: `/news/${news.id}`,
  });
}

/**
 * /news/[id] — public news detail page (WHAT'S NEW機能). Server Component,
 * no admin guard. Reached only from components/WhatsNew.tsx's own link,
 * which only ever links here when has_content is true — but this page is
 * reachable by direct URL too, so fetchPublicNewsItem()'s own content-is-
 * not-null condition is the real boundary, not "nothing links here".
 *
 * 本文のHTMLは描画しない（dangerouslySetInnerHTMLは使わない）。content は
 * プレーンテキストとして保存されており、whitespace-pre-wrapで改行のみ
 * 維持してそのまま表示する（app/music/[id]/page.tsxのsong.description、
 * app/page.tsxのANNOUNCEMENT_*と同じ表示方針。XSS対策として、タグとして
 * 解釈されず常にエスケープされたテキストとして表示される）。
 */
export default async function NewsDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const news = await fetchPublicNewsItem(id);

  if (!news) {
    notFound();
  }

  const hasLink = news.source_url !== null;
  const external = hasLink && isExternalNewsLink(news.source_url as string);

  return (
    <main className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
      <p className="mb-4">
        <Link href="/" className="text-sm font-bold text-brand underline-offset-2 hover:underline">
          ← トップページへ戻る
        </Link>
      </p>

      <p className="text-sm text-muted">{formatNewsDate(news.published_at)}</p>
      <h1 className="mt-2 text-2xl font-bold break-words sm:text-3xl">{news.title}</h1>

      <p className="mt-6 whitespace-pre-wrap break-words rounded-2xl border border-border bg-surface p-6 text-sm leading-relaxed">
        {news.content}
      </p>

      {hasLink ? (
        external ? (
          <a
            href={news.source_url as string}
            target="_blank"
            rel="noreferrer noopener"
            className="mt-4 inline-block font-bold text-brand underline-offset-2 hover:underline"
          >
            関連リンクを見る ↗
          </a>
        ) : (
          <Link
            href={news.source_url as string}
            className="mt-4 inline-block font-bold text-brand underline-offset-2 hover:underline"
          >
            関連リンクを見る
          </Link>
        )
      ) : null}
    </main>
  );
}
