"use client";

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
    <main>
      <h1>楽曲管理</h1>
      <p role="alert">楽曲一覧の取得に失敗しました。</p>
      <button type="button" onClick={() => retry()}>
        再試行
      </button>
    </main>
  );
}
