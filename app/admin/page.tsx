import { LogoutButton } from "./logout-button";

/**
 * Minimal /admin landing page (A1). No link to Songs management here —
 * /admin/music is not implemented yet (A2+).
 */
export default function AdminPage() {
  return (
    <main>
      <h1>管理画面</h1>
      <p>ログイン中です。</p>
      <LogoutButton />
    </main>
  );
}
