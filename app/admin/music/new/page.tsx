import Link from "next/link";

import { NewSongForm } from "@/components/admin/music/NewSongForm";

/**
 * /admin/music/new — new song creation form (A3). Guarded by
 * app/admin/layout.tsx (unchanged); no page-local data fetching is needed
 * here, so this stays a plain Server Component wrapper around the
 * Client Component form.
 */
export default function NewSongPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
      <p className="mb-4">
        <Link href="/admin/music" className="text-sm font-bold text-brand underline-offset-2 hover:underline">
          ← 楽曲一覧へ戻る
        </Link>
      </p>
      <h1 className="text-2xl font-bold sm:text-3xl">楽曲を追加</h1>
      <div className="mt-6">
        <NewSongForm />
      </div>
    </main>
  );
}
