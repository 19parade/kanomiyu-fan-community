import Link from "next/link";

import { NewEventForm } from "@/components/admin/events/NewEventForm";

export default function NewEventPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
      <p className="mb-4">
        <Link href="/admin/events" className="text-sm font-bold text-brand underline-offset-2 hover:underline">
          ← LIVE一覧へ戻る
        </Link>
      </p>
      <h1 className="text-2xl font-bold sm:text-3xl">LIVEを追加</h1>
      <div className="mt-6">
        <NewEventForm />
      </div>
    </main>
  );
}
