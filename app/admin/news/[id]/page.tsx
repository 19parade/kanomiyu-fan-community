import Link from "next/link";
import { notFound } from "next/navigation";

import { EditNewsForm } from "@/components/admin/news/EditNewsForm";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const UUID_SHAPE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

type AdminNewsDetail = {
  id: string;
  title: string;
  content: string | null;
  source_url: string | null;
  status: string;
  published_at: string;
  created_by: string;
  created_at: string;
  updated_at: string;
};

/**
 * /admin/news/[id] — news edit page (WHAT'S NEW機能), mirroring
 * app/admin/events/[id]/page.tsx: validates the id's *shape* before ever
 * calling get_admin_news_item (so a malformed value never surfaces as a raw
 * Postgres cast error), then fetches via get_admin_news_item using the same
 * server-scoped client app/admin/layout.tsx's guard already used for this
 * request (the RPC's own NEWS_MANAGEMENT_NOT_AUTHORIZED check remains as
 * defense-in-depth).
 *
 * `EditNewsForm` is keyed by `news.updated_at`: whenever this page
 * re-fetches with a different updated_at (via the form's own
 * router.refresh() after a 409 conflict), React remounts the form with
 * fresh initial values.
 */
export default async function EditNewsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  if (!UUID_SHAPE.test(id)) {
    notFound();
  }

  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.rpc("get_admin_news_item", { target_news_id: id });

  if (error) {
    console.error("edit news page: get_admin_news_item failed", error.message);
    return (
      <main className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
        <h1 className="text-2xl font-bold sm:text-3xl">お知らせを編集</h1>
        <p role="alert" className="mt-4 text-red-600">
          お知らせの取得に失敗しました。
        </p>
      </main>
    );
  }

  const news = (Array.isArray(data) ? data[0] : undefined) as AdminNewsDetail | undefined;

  if (!news) {
    notFound();
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
      <p className="mb-4">
        <Link href="/admin/news" className="text-sm font-bold text-brand underline-offset-2 hover:underline">
          ← お知らせ一覧へ戻る
        </Link>
      </p>
      <h1 className="text-2xl font-bold sm:text-3xl">お知らせを編集</h1>
      <div className="mt-6">
        <EditNewsForm
          key={news.updated_at}
          newsId={news.id}
          initialTitle={news.title}
          initialPublishedAt={news.published_at}
          initialContent={news.content}
          initialSourceUrl={news.source_url}
          initialIsPublished={news.status === "published"}
          initialUpdatedAt={news.updated_at}
        />
      </div>
    </main>
  );
}
