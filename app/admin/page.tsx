import Link from "next/link";

import { LogoutButton } from "./logout-button";

/**
 * /admin landing page. The link to Songs management was added in A2 —
 * /admin/music is now implemented (read-only list).
 */
export default function AdminPage() {
  return (
    <main>
      <h1>管理画面</h1>
      <p>ログイン中です。</p>
      <nav>
        <Link href="/admin/music">楽曲管理</Link>
        <br />
        <Link href="/admin/reports">通報管理</Link>
      </nav>
      <LogoutButton />
    </main>
  );
}
