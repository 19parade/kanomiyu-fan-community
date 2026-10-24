import type { Metadata } from "next";
import Link from "next/link";

import { EventImage } from "@/components/live/EventImage";
import { getEventImagePublicUrl } from "@/lib/event-images/public-url";
import { formatEventDateTime } from "@/lib/events/format";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "LIVE",
  description: "かのうみゆさんのLIVE情報一覧です。",
};

// The exact 11 public columns events grants anon/authenticated column-level
// SELECT on (see supabase/migrations/20260927200000_events_public_columns.sql
// and 20261024000000_events_schedule_and_official_link.sql) — never widened.
// `select("*")` is not usable here: it is rejected with a permission error,
// since table-level SELECT was revoked from anon/authenticated in M12.
const PUBLIC_EVENT_COLUMNS =
  "id,title,venue,event_date,description,image_url,ticket_url,status,doors_time,start_time,official_url";

type PublicEventRow = {
  id: string;
  title: string;
  venue: string;
  event_date: string;
  description: string | null;
  image_url: string | null;
  ticket_url: string | null;
  status: string;
  doors_time: string | null;
  start_time: string | null;
  official_url: string | null;
};

/**
 * /live — public LIVE listing (LIVE機能 Phase 1). Server Component: fetches
 * directly from `events` (no RPC — unlike /music, events has no
 * get_public_events() equivalent; the public read boundary here is "RLS row
 * visibility (M11) + column-level SELECT grants (M12)" on the base table,
 * see PROJECT_SPEC.md 6.5). createSupabaseServerClient() degrades to an
 * anonymous-role client when unauthenticated — never service_role — and the
 * RLS policy `events_select_public` already restricts rows to
 * status='public' or (status='cancelled' AND first_published_at is not
 * null), so this page applies no additional visibility filtering itself.
 *
 * 開催予定/開催終了 split and ordering (ascending for upcoming, descending
 * for ended, both with `id` as a deterministic tie-breaker) is this round's
 * own implementation choice — PROJECT_SPEC.md 6.5 explicitly leaves the
 * public /live ordering/pagination as a PM-undecided item. No pagination is
 * implemented yet (Phase 1 scope); every public row is fetched in one query
 * each.
 */
export default async function LiveListPage() {
  const supabase = await createSupabaseServerClient();
  const nowIso = new Date().toISOString();

  const [upcomingResult, endedResult] = await Promise.all([
    supabase
      .from("events")
      .select(PUBLIC_EVENT_COLUMNS)
      .gte("event_date", nowIso)
      .order("event_date", { ascending: true })
      .order("id", { ascending: true }),
    supabase
      .from("events")
      .select(PUBLIC_EVENT_COLUMNS)
      .lt("event_date", nowIso)
      .order("event_date", { ascending: false })
      .order("id", { ascending: false }),
  ]);

  if (upcomingResult.error || endedResult.error) {
    console.error(
      "live list page: events query failed",
      upcomingResult.error?.message,
      endedResult.error?.message
    );
    return (
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <h1 className="text-2xl font-bold sm:text-3xl">LIVE</h1>
        <p role="alert" className="mt-4 text-red-600">
          LIVE情報の取得に失敗しました。
        </p>
      </main>
    );
  }

  const toCard = (row: PublicEventRow): EventCard => ({
    ...row,
    image_display_url: getEventImagePublicUrl(supabase, row.image_url),
  });
  const upcoming = (upcomingResult.data ?? []).map((row) => toCard(row as unknown as PublicEventRow));
  const ended = (endedResult.data ?? []).map((row) => toCard(row as unknown as PublicEventRow));

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-bold sm:text-3xl">LIVE</h1>
      <p className="mt-2 text-sm text-muted">かのうみゆさんのLIVE情報一覧です。</p>

      <section className="mt-8">
        <h2 className="text-lg font-bold">開催予定</h2>
        <EventCardGrid events={upcoming} emptyMessage="開催予定のLIVEはまだありません。" />
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-bold">開催終了</h2>
        <EventCardGrid events={ended} emptyMessage="開催終了したLIVEはまだありません。" />
      </section>
    </main>
  );
}

type EventCard = PublicEventRow & { image_display_url: string | null };

function EventCardGrid({
  events,
  emptyMessage,
}: {
  events: EventCard[];
  emptyMessage: string;
}) {
  if (events.length === 0) {
    return (
      <div className="mt-4 flex flex-col items-center gap-3 rounded-2xl border border-border bg-surface px-6 py-10 text-center">
        <p className="text-muted">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <ul className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {events.map((event) => (
        <li key={event.id}>
          <Link
            href={`/live/${event.id}`}
            className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-surface transition-shadow hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            <div className="aspect-video w-full overflow-hidden bg-background">
              <EventImage src={event.image_display_url} alt={`${event.title}のキービジュアル`} />
            </div>
            <div className="flex flex-1 flex-col gap-1 p-4">
              {event.status === "cancelled" ? (
                <span className="inline-block w-fit rounded-full bg-rose-100 px-2 py-0.5 text-xs font-bold text-rose-700">
                  開催中止
                </span>
              ) : null}
              <p className="line-clamp-2 break-words font-bold text-foreground">{event.title}</p>
              <p className="text-sm text-muted">{formatEventDateTime(event.event_date)}</p>
              <p className="text-sm text-muted">{event.venue}</p>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
