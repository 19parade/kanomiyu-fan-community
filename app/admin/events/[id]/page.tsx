import Link from "next/link";
import { notFound } from "next/navigation";

import { EditEventForm } from "@/components/admin/events/EditEventForm";
import { getEventImagePublicUrl } from "@/lib/event-images/public-url";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const UUID_SHAPE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

type AdminEventDetail = {
  id: string;
  title: string;
  venue: string;
  event_date: string;
  description: string | null;
  image_url: string | null;
  ticket_url: string | null;
  status: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  first_published_at: string | null;
  doors_time: string | null;
  start_time: string | null;
  official_url: string | null;
};

/**
 * /admin/events/[id] — event edit page (LIVE機能 Phase 1), mirroring
 * app/admin/music/[id]/page.tsx: validates the id's *shape* before ever
 * calling get_admin_event (so a malformed value never surfaces as a raw
 * Postgres cast error), then fetches via get_admin_event using the same
 * server-scoped client app/admin/layout.tsx's guard already used for this
 * request (the RPC's own EVENT_MANAGEMENT_NOT_AUTHORIZED check remains as
 * defense-in-depth).
 *
 * `EditEventForm` is keyed by `event.updated_at`: whenever this page
 * re-fetches with a different updated_at (via the form's own
 * router.refresh() after a 409 conflict), React remounts the form with
 * fresh initial values.
 */
export default async function EditEventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  if (!UUID_SHAPE.test(id)) {
    notFound();
  }

  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.rpc("get_admin_event", { target_event_id: id });

  if (error) {
    console.error("edit event page: get_admin_event failed", error.message);
    return (
      <main>
        <h1>LIVEを編集</h1>
        <p role="alert">LIVE情報の取得に失敗しました。</p>
      </main>
    );
  }

  const event = (Array.isArray(data) ? data[0] : undefined) as AdminEventDetail | undefined;

  if (!event) {
    notFound();
  }

  return (
    <main>
      <p>
        <Link href="/admin/events">← LIVE一覧へ戻る</Link>
      </p>
      <h1>LIVEを編集</h1>
      <EditEventForm
        key={event.updated_at}
        eventId={event.id}
        initialTitle={event.title}
        initialVenue={event.venue}
        initialEventDate={event.event_date}
        initialDoorsTime={event.doors_time}
        initialStartTime={event.start_time}
        initialDescription={event.description}
        initialImageKey={event.image_url}
        initialImageDisplayUrl={getEventImagePublicUrl(supabase, event.image_url)}
        initialTicketUrl={event.ticket_url}
        initialOfficialUrl={event.official_url}
        initialStatus={event.status}
        initialFirstPublishedAt={event.first_published_at}
        initialUpdatedAt={event.updated_at}
      />
    </main>
  );
}
