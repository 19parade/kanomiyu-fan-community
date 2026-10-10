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
    <main>
      <p>
        <Link href="/admin/music">← 楽曲一覧へ戻る</Link>
      </p>
      <h1>楽曲を追加</h1>
      <NewSongForm />
    </main>
  );
}
