import Link from "next/link";

import { EventsAdminList, type AdminEventRow } from "@/components/admin/events/EventsAdminList";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const INITIAL_PAGE_SIZE = 20;

/**
 * /admin/events — read-only event list (LIVE機能 Phase 1). Server Component:
 * fetches the first page directly via get_admin_events() using the same
 * server-scoped client app/admin/layout.tsx's guard already used for this
 * request. That guard already blocks non-admins; this RPC's own
 * EVENT_MANAGEMENT_NOT_AUTHORIZED check is kept as defense-in-depth (mirrors
 * app/admin/music/page.tsx).
 *
 * Search, status filtering, and "load more" are handled entirely by the
 * Client Component below against GET /api/admin/events.
 */
export default async function AdminEventsPage() {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.rpc("get_admin_events", {
    search: null,
    status_filter: null,
    after_event_date: null,
    after_id: null,
    page_size: INITIAL_PAGE_SIZE,
  });

  if (error) {
    console.error("admin events page: initial get_admin_events failed", error.message);
    return (
      <main>
        <h1>LIVE管理</h1>
        <p role="alert">LIVE一覧の取得に失敗しました。</p>
      </main>
    );
  }

  const events = (data ?? []) as AdminEventRow[];

  return (
    <main>
      <h1>LIVE管理</h1>
      <p>LIVEの一覧を確認できます。</p>
      <p>
        <Link href="/admin/events/new">LIVEを追加</Link>
      </p>
      <EventsAdminList initialEvents={events} initialHasMore={events.length === INITIAL_PAGE_SIZE} />
    </main>
  );
}
