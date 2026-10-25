import type { Metadata } from "next";
import Link from "next/link";

import { FeedList } from "@/components/feed/FeedList";
import { buttonClassName } from "@/components/ui/Button";
import { resolveMemberAccess } from "@/lib/member/access";
import { fetchAuthorsByIds } from "@/lib/posts/authors";
import { FEED_LIST_SELECT_COLUMNS, mapPostListRow, type PostListRow } from "@/lib/posts/mapRows";
import { buildPageMetadata } from "@/lib/seo/metadata";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const INITIAL_PAGE_SIZE = 20;

export const metadata: Metadata = buildPageMetadata({
  title: "みんなの掲示板",
  description:
    "かのうみゆさんのこと、自由に話そう！自己紹介や日々の雑談、やってほしい企画、欲しいグッズのアイデアなど、ファン同士で気軽に交流できる掲示板です。",
  path: "/feed",
});

// PM方針 2026-10-25: グローバルナビの「みんなの掲示板」への改称に合わせて、
// このページ自身の見出し・説明文も合わせる。改行・絵文字は原文のまま、
// whitespace-pre-wrap で表示する。
const FEED_DESCRIPTION = `かのうみゆさんのこと、自由に話そう！🌸
自己紹介や日々の雑談、やってほしい企画、欲しいグッズのアイデアなど、ファン同士で気軽に交流できる場所です。各投稿をタップするとコメントすることができます。`;

/**
 * /feed — public post feed (F5-D1). Server Component: fetches the first
 * page directly from `posts` (no RPC needed — see app/api/feed/route.ts's
 * doc comment for why a direct SELECT is viable here, unlike /fans),
 * mirroring app/fans/page.tsx's structure. Read-only: no post creation,
 * editing, deletion, commenting, liking, or reporting in this phase.
 *
 * createSupabaseServerClient() is cookie-bound — a logged-in visitor's own
 * session reaches the query as themselves (bidirectional block filtering
 * and community-browsing gating apply via posts' own RLS), while an
 * anonymous visitor degrades to the anon policy. Never service_role.
 */
export default async function FeedPage() {
  const supabase = await createSupabaseServerClient();
  const access = await resolveMemberAccess(supabase);
  const canPost = access.kind === "member_active" || access.kind === "admin_active";

  const { data, error } = await supabase
    .from("posts")
    .select(FEED_LIST_SELECT_COLUMNS)
    .eq("status", "published")
    // LIVE機能 Phase 3: LIVE掲示板の投稿(post_type='live_report')は対象LIVEの
    // 掲示板(/live/[id])にのみ表示し、通常フィードには混在させない(PM方針)。
    // DB・RLSの変更ではなく、このアプリ層のクエリにのみ絞り込みを追加する。
    .eq("post_type", "normal")
    // F5-D1b §5: see lib/posts/mapRows.ts's doc comment — without this, an
    // admin/the post's own author would see their own hidden/deleted
    // comments leak into comments(count).
    .eq("comments.status", "published")
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(INITIAL_PAGE_SIZE);

  const failedMessage = (
    <main className="mx-auto min-w-0 max-w-2xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-bold sm:text-3xl">みんなの掲示板</h1>
      <p role="alert" className="mt-4 text-red-600">
        投稿一覧の取得に失敗しました。
      </p>
    </main>
  );

  if (error) {
    // Never surface the raw DB error message to the browser.
    console.error("feed page: initial posts query failed", error.message);
    return failedMessage;
  }

  const rows = (data ?? []) as unknown as PostListRow[];
  const authorLookup = await fetchAuthorsByIds(
    supabase,
    rows.map((row) => row.author_id)
  );

  // F5-D1b §3 case B: the author RPC failing is a real backend failure —
  // render the same failure state as a posts-query failure, never a page
  // full of fake "unavailable" authors presented as normal.
  if (!authorLookup.ok) {
    console.error("feed page: author batch lookup failed");
    return failedMessage;
  }

  const posts = rows.map((row) => mapPostListRow(row, authorLookup.authors));

  return (
    <main className="mx-auto min-w-0 max-w-2xl px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold sm:text-3xl">みんなの掲示板</h1>
          <p className="mt-2 whitespace-pre-wrap break-words text-sm text-muted">{FEED_DESCRIPTION}</p>
        </div>
        {canPost ? (
          <Link href="/feed/new" className={buttonClassName("primary", "w-full sm:w-auto")}>
            新規投稿
          </Link>
        ) : access.kind === "unauthenticated" ? (
          <Link href="/login?next=/feed" className={buttonClassName("secondary", "w-full sm:w-auto")}>
            ログインして投稿する
          </Link>
        ) : null}
      </div>
      <FeedList initialPosts={posts} initialHasMore={rows.length === INITIAL_PAGE_SIZE} />
    </main>
  );
}
