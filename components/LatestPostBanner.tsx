import Link from "next/link";

import { excerptContent } from "@/lib/posts/format";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// 1行のバナーに収める想定のため、一覧カードの抜粋（EXCERPT_LENGTH=140、
// lib/posts/mapRows.ts）より短く切る。CSSのtruncateと二重の安全策。
const EXCERPT_LENGTH = 50;

const CATEGORY_LABEL: Record<string, string> = {
  live_report: "LIVE",
  normal: "みんなの掲示板",
};

type LatestPostRow = {
  id: string;
  post_type: string;
  content: string;
};

/**
 * 「新着投稿」バナー（PM依頼 2026-11-21）: トップページのヘッダーと
 * メインビジュアルの間に、サイト全体（LIVE掲示板＋みんなの掲示板）で
 * 最も新しい投稿を1行で表示する。コメントは対象外（投稿のみ）。
 *
 * Server Component: createSupabaseServerClient()が閲覧者自身のcookie
 * セッションで動くため、postsのRLS（公開済みのみ全員に見える。ログイン中
 * は自分がブロックした投稿者の投稿を除く）がそのまま適用される —
 * app/feed/page.tsxと同じ直接SELECTの方針（RPCなし）。post_typeでの
 * 絞り込みは行わず（/feedの一覧が`post_type='normal'`のみに絞るのとは
 * 異なり）、LIVE掲示板（live_report）とみんなの掲示板（normal）の両方
 * から、日付が新しい方を1件だけ取得する。
 *
 * 新着投稿が1件もない（まだ投稿がゼロ件）場合は何も表示しない —
 * components/WhatsNew.tsxと同じ「0件なら非表示」方針。
 */
export async function LatestPostBanner() {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("posts")
    .select("id, post_type, content")
    .eq("status", "published")
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    // トップページ全体を壊さない — ログのみ残し、0件と同じ非表示扱いにする。
    console.error("LatestPostBanner: posts query failed", error.message);
    return null;
  }

  const post = data as LatestPostRow | null;
  if (!post) {
    return null;
  }

  const categoryLabel = CATEGORY_LABEL[post.post_type] ?? post.post_type;
  const excerpt = excerptContent(post.content, EXCERPT_LENGTH);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-4 pt-4 sm:px-6">
      <Link
        href={`/feed/${post.id}`}
        className="flex items-center gap-2 overflow-hidden rounded-full border border-border bg-surface px-4 py-2 text-sm transition-colors hover:bg-foreground/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
      >
        <span className="shrink-0 rounded-full bg-brand px-2.5 py-1 text-xs font-bold text-brand-foreground">
          新着投稿
        </span>
        <span className="shrink-0 rounded-full bg-foreground/5 px-2 py-1 text-xs font-bold text-muted">
          {categoryLabel}
        </span>
        <span className="min-w-0 flex-1 truncate font-bold text-foreground">{excerpt}</span>
      </Link>
    </div>
  );
}
