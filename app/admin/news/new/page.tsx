import Link from "next/link";

import { NewNewsForm } from "@/components/admin/news/NewNewsForm";

/**
 * /admin/news/new — news creation page (WHAT'S NEW機能), mirroring
 * app/admin/events/new/page.tsx's structure exactly.
 */
export default function NewNewsPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
      <p className="mb-4">
        <Link href="/admin/news" className="text-sm font-bold text-brand underline-offset-2 hover:underline">
          ← お知らせ一覧へ戻る
        </Link>
      </p>
      <h1 className="text-2xl font-bold sm:text-3xl">お知らせを追加</h1>
      <div className="mt-6">
        <NewNewsForm />
      </div>
    </main>
  );
}
