import Link from "next/link";

import { NewEventForm } from "@/components/admin/events/NewEventForm";

export default function NewEventPage() {
  return (
    <main>
      <p>
        <Link href="/admin/events">← LIVE一覧へ戻る</Link>
      </p>
      <h1>LIVEを追加</h1>
      <NewEventForm />
    </main>
  );
}
