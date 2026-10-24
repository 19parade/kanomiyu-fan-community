import Link from "next/link";

import { buttonClassName } from "@/components/ui/Button";

/**
 * Rendered when app/live/[id]/page.tsx calls notFound() — an invalid UUID
 * shape, a nonexistent event, or a draft/never-published-cancelled event's
 * id are all the same "not found" outcome to an anonymous visitor (the RLS
 * policy `events_select_public` already returns zero rows for those cases —
 * see that policy's own doc comment), so this page never distinguishes
 * "exists but not public" from "doesn't exist" (mirrors
 * app/music/[id]/not-found.tsx).
 */
export default function EventNotFound() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-8 text-center sm:px-6">
      <h1 className="text-2xl font-bold sm:text-3xl">LIVEが見つかりません</h1>
      <p className="mt-2 text-muted">指定されたLIVEは存在しないか、非公開になっている可能性があります。</p>
      <p className="mt-6">
        <Link href="/live" className={buttonClassName("secondary")}>
          ← LIVE一覧へ戻る
        </Link>
      </p>
    </main>
  );
}
