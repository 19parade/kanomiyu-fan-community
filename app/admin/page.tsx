import Link from "next/link";

import { Card } from "@/components/ui/Card";

const SECTIONS = [
  { href: "/admin/music", title: "楽曲管理", description: "楽曲の登録・編集・公開状態の管理を行います。" },
  { href: "/admin/events", title: "LIVE管理", description: "LIVE情報の登録・編集・公開・中止の管理を行います。" },
  { href: "/admin/reports", title: "通報管理", description: "寄せられた通報内容の確認・対応を行います。" },
] as const;

/**
 * /admin landing page (visual-only redesign). The link to Events management
 * ("LIVE管理") was missing entirely before this pass — added alongside the
 * Songs/Reports links as a third dashboard card.
 */
export default function AdminPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-bold sm:text-3xl">管理画面</h1>
      <p className="mt-2 text-sm text-muted">ログイン中です。管理する項目を選んでください。</p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {SECTIONS.map((section) => (
          <Link key={section.href} href={section.href} className="block">
            <Card className="h-full p-6 transition-shadow hover:shadow-md">
              <h2 className="font-bold">{section.title}</h2>
              <p className="mt-2 text-sm text-muted">{section.description}</p>
              <span className="mt-4 inline-block text-sm font-bold text-brand">開く →</span>
            </Card>
          </Link>
        ))}
      </div>
    </main>
  );
}
