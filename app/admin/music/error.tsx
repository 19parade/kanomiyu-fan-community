"use client";

import { buttonClassName } from "@/components/ui/Button";

/**
 * Error boundary for /admin/music (A2). This Next.js version's error.js
 * props are `{ error, retry }` — not the `{ error, reset }` shape from
 * older Next.js releases (reconfirmed from node_modules/next/dist/docs/
 * 01-app/03-api-reference/03-file-conventions/error.md before writing
 * this, per AGENTS.md).
 */
export default function AdminMusicError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  console.error("admin music page: unexpected render error", error);

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-bold sm:text-3xl">楽曲管理</h1>
      <p role="alert" className="mt-4 text-red-600">
        楽曲一覧の取得に失敗しました。
      </p>
      <button type="button" onClick={() => retry()} className={buttonClassName("secondary", "mt-4")}>
        再試行
      </button>
    </main>
  );
}
