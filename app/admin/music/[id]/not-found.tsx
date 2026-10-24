import Link from "next/link";

/**
 * Rendered when app/admin/music/[id]/page.tsx calls notFound() — either the
 * `id` route param isn't a valid UUID shape, or get_admin_song() returned
 * no row for it. Both cases mean the same thing to the admin ("no such
 * song"); this is never reached for an authorization failure, since
 * app/admin/layout.tsx's guard runs first and blocks non-admins before this
 * segment renders at all.
 */
export default function SongNotFound() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-bold sm:text-3xl">楽曲が見つかりません</h1>
      <p className="mt-2 text-sm text-muted">指定された楽曲は存在しないか、削除された可能性があります。</p>
      <p className="mt-4">
        <Link href="/admin/music" className="text-sm font-bold text-brand underline-offset-2 hover:underline">
          ← 楽曲一覧へ戻る
        </Link>
      </p>
    </main>
  );
}
