import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { EventImage } from "@/components/live/EventImage";
import { ParticipationStatus } from "@/components/live/ParticipationStatus";
import { getEventImagePublicUrl } from "@/lib/event-images/public-url";
import { formatEventDateTime } from "@/lib/events/format";
import { resolveMemberAccess } from "@/lib/member/access";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const UUID_SHAPE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

// Same 11 public columns as app/live/(list)/page.tsx — never widened.
const PUBLIC_EVENT_COLUMNS =
  "id,title,venue,event_date,description,image_url,ticket_url,status,doors_time,start_time,official_url";

type PublicEventDetail = {
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
 * Fetches a single event from `events` using the exact same public column
 * list / RLS boundary as the list page (no get_public_event() RPC exists for
 * events — see app/live/(list)/page.tsx's doc comment). A malformed id, a
 * nonexistent id, and a non-public id (draft, or cancelled-never-published)
 * are all indistinguishable — zero rows (PROJECT_SPEC.md 6.5's own stated
 * design for events_select_public).
 */
async function fetchPublicEvent(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  id: string
): Promise<{ event: PublicEventDetail | null; imageUrl: string | null }> {
  if (!UUID_SHAPE.test(id)) {
    return { event: null, imageUrl: null };
  }

  const { data, error } = await supabase
    .from("events")
    .select(PUBLIC_EVENT_COLUMNS)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("live detail: events query failed", error.message);
    return { event: null, imageUrl: null };
  }

  const event = (data as unknown as PublicEventDetail | null) ?? null;
  const imageUrl = event ? getEventImagePublicUrl(supabase, event.image_url) : null;
  return { event, imageUrl };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { event } = await fetchPublicEvent(supabase, id);

  if (!event) {
    return { title: "LIVEが見つかりません" };
  }

  return { title: event.title };
}

/**
 * /live/[id] — public LIVE detail page (LIVE機能 Phase 1). Server Component,
 * no auth guard (public content). Deliberately has no loading.tsx of its own
 * — same real-HTTP-404 reasoning as app/music/[id]/page.tsx's doc comment
 * (the `(list)` route group's Suspense boundary does not extend to this
 * sibling segment).
 *
 * `status === 'cancelled'` rows ARE shown here (they remain publicly visible
 * per events_select_public once first_published_at is set — PM方針「公開を
 * 継続し、画面上に開催中止と明示する」) rather than treated as not-found.
 *
 * Does not render a 掲示板 tab — out of scope for this phase (Phase 3).
 * Participation status (LIVE機能 Phase 2) is rendered below via
 * components/live/ParticipationStatus.tsx, a Client Component — this page
 * itself stays a Server Component and only does the read-only own-row fetch
 * (event_participants_select_own) needed to seed its initial state.
 */
export default async function EventDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { event, imageUrl } = await fetchPublicEvent(supabase, id);

  if (!event) {
    notFound();
  }

  const access = await resolveMemberAccess(supabase);
  const isLoggedIn = access.kind !== "unauthenticated";

  let initialParticipation: { status: "going" | "attended" | "cancelled" } | null = null;
  if (access.kind === "member_active" || access.kind === "admin_active") {
    const { data: participationRow, error: participationError } = await supabase
      .from("event_participants")
      .select("status")
      .eq("event_id", id)
      .eq("user_id", access.userId)
      .maybeSingle();

    if (participationError) {
      // Never block the rest of the page on this — the widget below simply
      // starts from "未選択" and the user can still read/retry via the API.
      console.error("live detail: own participation row fetch failed", participationError.message);
    } else if (participationRow) {
      initialParticipation = { status: participationRow.status as "going" | "attended" | "cancelled" };
    }
  }

  const doorsTimeText = formatEventDateTime(event.doors_time);
  const startTimeText = formatEventDateTime(event.start_time);

  return (
    <main className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
      <p className="mb-4">
        <Link href="/live" className="text-sm font-bold text-brand underline-offset-2 hover:underline">
          ← LIVE一覧へ戻る
        </Link>
      </p>

      {event.status === "cancelled" ? (
        <div role="alert" className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-900">
          このLIVEは開催中止となりました。
        </div>
      ) : null}

      <div className="aspect-video w-full overflow-hidden rounded-2xl border border-border bg-surface">
        <EventImage src={imageUrl} alt={`${event.title}のキービジュアル`} />
      </div>

      <h1 className="mt-6 text-2xl font-bold break-words sm:text-3xl">{event.title}</h1>

      <dl className="mt-4 grid grid-cols-1 gap-3 rounded-2xl border border-border bg-surface p-5 text-sm sm:grid-cols-2">
        <div>
          <dt className="font-bold text-muted">開催日時</dt>
          <dd className="mt-0.5">{formatEventDateTime(event.event_date)}</dd>
        </div>
        <div>
          <dt className="font-bold text-muted">会場</dt>
          <dd className="mt-0.5 break-words">{event.venue}</dd>
        </div>
        <div>
          <dt className="font-bold text-muted">開場時間</dt>
          <dd className="mt-0.5">{doorsTimeText ?? "未定"}</dd>
        </div>
        <div>
          <dt className="font-bold text-muted">開演時間</dt>
          <dd className="mt-0.5">{startTimeText ?? "未定"}</dd>
        </div>
      </dl>

      {event.description ? (
        <p className="mt-6 whitespace-pre-wrap break-words rounded-2xl border border-border bg-surface p-6 text-sm leading-relaxed">
          {event.description}
        </p>
      ) : null}

      <div className="mt-6 flex flex-wrap gap-3">
        {event.official_url ? (
          <a
            href={event.official_url}
            target="_blank"
            rel="noreferrer"
            className="text-sm font-bold text-brand underline-offset-2 hover:underline"
          >
            公式情報を見る →
          </a>
        ) : null}
        {event.ticket_url ? (
          <a
            href={event.ticket_url}
            target="_blank"
            rel="noreferrer"
            className="text-sm font-bold text-brand underline-offset-2 hover:underline"
          >
            チケット情報を見る →
          </a>
        ) : null}
      </div>

      <ParticipationStatus
        eventId={event.id}
        eventStatus={event.status as "public" | "cancelled"}
        eventDate={event.event_date}
        initialParticipation={initialParticipation}
        isLoggedIn={isLoggedIn}
      />
    </main>
  );
}
