"use client";

import Link from "next/link";

import { buttonClassName } from "@/components/ui/Button";

/**
 * F5-D1: error boundary for app/feed/[id]/page.tsx. page.tsx's
 * fetchPostDetail() throws (rather than returning an inline error state)
 * specifically so a genuine DB failure produces a real HTTP 500 — this
 * project's first use of the error.tsx convention (prior detail pages like
 * app/fans/[username]/page.tsx deliberately render a 200-with-message
 * instead; F5-D1 explicitly requires 404/500 to be distinguishable
 * statuses for this page, which only a thrown error can produce). The
 * thrown error's message is never shown here — only a generic Japanese
 * message — so no internal detail ever reaches the browser.
 */
export default function PostDetailError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto max-w-2xl px-4 py-8 text-center sm:px-6">
      <h1 className="text-2xl font-bold sm:text-3xl">投稿を表示できませんでした</h1>
      <p className="mt-2 text-muted">しばらくしてから再度お試しください。</p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <button type="button" onClick={reset} className={buttonClassName("secondary")}>
          再試行
        </button>
        <Link href="/feed" className={buttonClassName("primary")}>
          投稿一覧へ戻る
        </Link>
      </div>
    </main>
  );
}
