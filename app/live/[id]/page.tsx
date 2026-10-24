import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { EventImage } from "@/components/live/EventImage";
import { ParticipationStatus } from "@/components/live/ParticipationStatus";
import { PostCard } from "@/components/feed/PostCard";
import { PostForm } from "@/components/feed/PostForm";
import { getEventImagePublicUrl } from "@/lib/event-images/public-url";
import { formatEventDateTime } from "@/lib/events/format";
import { resolveMemberAccess } from "@/lib/member/access";
import { fetchAuthorsByIds } from "@/lib/posts/authors";
import { FEED_LIST_SELECT_COLUMNS, mapPostListRow, type PostListRow } from "@/lib/posts/mapRows";
import type { PublicPostListItem } from "@/lib/posts/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const LIVE_BOARD_PAGE_SIZE = 20;

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

/**
 * LIVE機能 Phase 3: fetches this event's board posts (post_type='live_report',
 * event_id = this event) using the exact same column list / author-batch /
 * comments.status-filter pattern as app/feed/page.tsx's own query — see
 * lib/posts/mapRows.ts's doc comment for why `.eq("comments.status",
 * "published")` is required on top of RLS. posts_select_public_anon /
 * posts_select_visible_authenticated already restrict which rows are
 * visible at all (block/community-browsing gating); this call additionally
 * narrows to this one event's live_report posts only, so other LIVEs'
 * boards never leak into this page's list. No pagination UI in this phase —
 * a flat `limit()` only.
 */
async function fetchLiveBoardPosts(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  eventId: string
): Promise<{ ok: true; posts: PublicPostListItem[] } | { ok: false }> {
  const { data, error } = await supabase
    .from("posts")
    .select(FEED_LIST_SELECT_COLUMNS)
    .eq("status", "published")
    .eq("post_type", "live_report")
    .eq("event_id", eventId)
    .eq("comments.status", "published")
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(LIVE_BOARD_PAGE_SIZE);

  if (error) {
    console.error("live detail: board posts query failed", error.message);
    return { ok: false };
  }

  const rows = (data ?? []) as unknown as PostListRow[];
  const authorLookup = await fetchAuthorsByIds(
    supabase,
    rows.map((row) => row.author_id)
  );

  if (!authorLookup.ok) {
    console.error("live detail: board author batch lookup failed");
    return { ok: false };
  }

  return { ok: true, posts: rows.map((row) => mapPostListRow(row, authorLookup.authors)) };
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
 * Participation status (LIVE機能 Phase 2) is rendered below via
 * components/live/ParticipationStatus.tsx, a Client Component — this page
 * itself stays a Server Component and only does the read-only own-row fetch
 * (event_participants_select_own) needed to seed its initial state.
 *
 * LIVE掲示板 (LIVE機能 Phase 3): posts where post_type='live_report' AND
 * event_id = this event. Reuses posts/comments/likes/reports wholesale —
 * see fetchLiveBoardPosts()'s doc comment below. Not a separate tab; a
 * plain section under the participation widget (no tab-switching UI was
 * requested for this phase).
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
  const boardResult = await fetchLiveBoardPosts(supabase, event.id);

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

      <section className="mt-6 rounded-2xl border border-border bg-surface p-5">
        <h2 className="font-bold">LIVE掲示板</h2>
        <p className="mt-1 text-sm text-muted">このLIVEについての投稿・感想をファン同士で共有できます。</p>

        <div className="mt-4">
          {access.kind === "member_active" || access.kind === "admin_active" ? (
            <PostForm mode="create-live" userId={access.userId} eventId={event.id} />
          ) : (
            <p className="text-sm text-muted">
              <Link href={`/login?next=/live/${event.id}`} className="font-bold text-brand underline-offset-2 hover:underline">
                ログイン
              </Link>
              すると、この掲示板に投稿できます。
            </p>
          )}
        </div>

        <div className="mt-6 flex flex-col gap-3">
          {!boardResult.ok ? (
            <p role="alert" className="text-red-600">
              投稿一覧の取得に失敗しました。
            </p>
          ) : boardResult.posts.length === 0 ? (
            <p className="text-sm text-muted">まだ投稿がありません。最初の投稿をしてみませんか？</p>
          ) : (
            boardResult.posts.map((post) => <PostCard key={post.id} post={post} />)
          )}
        </div>
      </section>
    </main>
  );
}
