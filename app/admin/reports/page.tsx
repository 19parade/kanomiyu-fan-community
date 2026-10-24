import Link from "next/link";

import { ReportsAdminList } from "@/components/admin/reports/ReportsAdminList";
import { fetchAdminReports } from "@/lib/admin/reports/list";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * /admin/reports — F5-D4b: admin-only report list + inline processing.
 * app/admin/layout.tsx's requireActiveAdmin() guard already covers this
 * whole subtree; this page's own fetchAdminReports() call still goes
 * through reports_select_admin regardless (defense-in-depth, same pattern
 * app/admin/music/page.tsx established).
 *
 * Status filtering and "load more" are handled by the Client Component
 * below against GET /api/admin/reports — this page never re-fetches on its
 * own after the first render (same split as app/admin/music/page.tsx /
 * MusicAdminList.tsx).
 */
export default async function AdminReportsPage() {
  const supabase = await createSupabaseServerClient();

  const result = await fetchAdminReports(supabase, {
    statusFilter: null,
    afterCreatedAt: null,
    afterId: null,
  });

  if (!result.ok) {
    return (
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <p className="mb-4">
          <Link href="/admin" className="text-sm font-bold text-brand underline-offset-2 hover:underline">
            ← 管理画面トップへ戻る
          </Link>
        </p>
        <h1 className="text-2xl font-bold sm:text-3xl">通報一覧</h1>
        <p role="alert" className="mt-4 text-red-600">
          通報一覧の取得に失敗しました。
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <p className="mb-4">
        <Link href="/admin" className="text-sm font-bold text-brand underline-offset-2 hover:underline">
          ← 管理画面トップへ戻る
        </Link>
      </p>
      <h1 className="text-2xl font-bold sm:text-3xl">通報一覧</h1>
      <p className="mt-2 text-sm text-muted">会員から寄せられた通報を確認し、対応状況を記録します。</p>
      <div className="mt-6">
        <ReportsAdminList initialReports={result.reports} initialHasMore={result.hasMore} />
      </div>
    </main>
  );
}
