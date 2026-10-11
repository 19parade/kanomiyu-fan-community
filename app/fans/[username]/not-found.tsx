import Link from "next/link";

import { buttonClassName } from "@/components/ui/Button";

/**
 * Rendered when app/fans/[username]/page.tsx calls notFound() — a
 * nonexistent username, an invalid-shape username, a banned profile, or
 * (for a logged-in viewer) a bidirectionally-blocked profile are all the
 * same "not found" outcome to the caller (get_public_profile() itself
 * already returns zero rows for all of these — see that RPC's own doc
 * comment — so this page never distinguishes which case occurred).
 *
 * Styling mirrors app/music/[id]/not-found.tsx.
 */
export default function FanProfileNotFound() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-8 text-center sm:px-6">
      <h1 className="text-2xl font-bold sm:text-3xl">ファンが見つかりません</h1>
      <p className="mt-2 text-muted">指定されたユーザーは存在しないか、非公開になっている可能性があります。</p>
      <p className="mt-6">
        <Link href="/fans" className={buttonClassName("secondary")}>
          ← ファン一覧へ戻る
        </Link>
      </p>
    </main>
  );
}
