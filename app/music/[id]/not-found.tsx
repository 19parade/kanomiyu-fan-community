import Link from "next/link";

/**
 * Rendered when app/music/[id]/page.tsx calls notFound() — an invalid UUID
 * shape, a nonexistent song, or a draft song's id, are all the same "not
 * found" outcome to an anonymous visitor (get_public_song() itself already
 * returns zero rows for a draft id — see that RPC's own doc comment — so
 * this page never distinguishes "exists but draft" from "doesn't exist").
 */
export default function SongNotFound() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="text-2xl font-bold">楽曲が見つかりません</h1>
      <p className="mt-2 text-gray-600">指定された楽曲は存在しないか、非公開になっている可能性があります。</p>
      <p className="mt-6">
        <Link href="/music" className="text-blue-600 underline">
          ← 楽曲一覧へ戻る
        </Link>
      </p>
    </main>
  );
}
