import Link from "next/link";

import { buttonClassName } from "@/components/ui/Button";

/**
 * Rendered when app/feed/[id]/page.tsx calls notFound() — a nonexistent
 * id, a malformed-shape id, a hidden/deleted post, or (for a logged-in
 * viewer) a bidirectionally-blocked post's content are all the same "not
 * found" outcome to the caller, never distinguished (existence-oracle
 * safe). Styling mirrors app/fans/[username]/not-found.tsx.
 */
export default function PostNotFound() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-8 text-center sm:px-6">
      <h1 className="text-2xl font-bold sm:text-3xl">投稿が見つかりません</h1>
      <p className="mt-2 text-muted">指定された投稿は存在しないか、非公開になっている可能性があります。</p>
      <p className="mt-6">
        <Link href="/feed" className={buttonClassName("secondary")}>
          ← 投稿一覧へ戻る
        </Link>
      </p>
    </main>
  );
}
