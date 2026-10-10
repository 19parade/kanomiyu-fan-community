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
    <main>
      <h1>楽曲が見つかりません</h1>
      <p>指定された楽曲は存在しないか、削除された可能性があります。</p>
      <p>
        <Link href="/admin/music">← 楽曲一覧へ戻る</Link>
      </p>
    </main>
  );
}
