import Link from "next/link";

import { NewsAdminList, type AdminNewsRow } from "@/components/admin/news/NewsAdminList";
import { buttonClassName } from "@/components/ui/Button";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const INITIAL_PAGE_SIZE = 50;

/**
 * /admin/news — read-only news list (WHAT'S NEW機能), mirroring
 * app/admin/music/page.tsx: Server Component fetches the first page
 * directly via get_admin_news() using the same server-scoped client
 * app/admin/layout.tsx's guard already used for this request. That guard
 * already blocks non-admins from reaching this page at all; this RPC call's
 * own NEWS_MANAGEMENT_NOT_AUTHORIZED check is kept as defense-in-depth, not
 * skipped just because the layout ran.
 *
 * Status filtering, "load more", and delete are handled entirely by the
 * Client Component below against /api/admin/news — this page never
 * re-fetches on its own after the first render.
 */
export default async function AdminNewsPage() {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.rpc("get_admin_news", {
    status_filter: null,
    page_size: INITIAL_PAGE_SIZE,
    after_published_at: null,
    after_id: null,
  });

  if (error) {
    // Never surface the raw DB error message to the browser.
    console.error("admin news page: initial get_admin_news failed", error.message);
    return (
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <h1 className="text-2xl font-bold sm:text-3xl">お知らせ管理</h1>
        <p role="alert" className="mt-4 text-red-600">
          お知らせ一覧の取得に失敗しました。
        </p>
      </main>
    );
  }

  const news = (data ?? []) as AdminNewsRow[];

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold sm:text-3xl">お知らせ管理</h1>
          <p className="mt-2 text-sm text-muted">
            トップページのWHAT&apos;S NEWに表示する新着情報の一覧です（日付の新しい順）。
          </p>
        </div>
        <Link href="/admin/news/new" className={buttonClassName("primary", "w-full sm:w-auto")}>
          お知らせを追加
        </Link>
      </div>
      <NewsAdminList initialNews={news} initialHasMore={news.length === INITIAL_PAGE_SIZE} />
    </main>
  );
}
