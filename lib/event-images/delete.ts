import type { SupabaseClient } from "@supabase/supabase-js";

const BUCKET = "event-images";

export type DeleteEventImageOutcome = "deleted" | "uncollected" | "error";

/**
 * Best-effort delete of an event-images object, through the user-scoped
 * Storage API (never service_role — see lib/supabase/server.ts). Mirrors
 * lib/song-images/delete.ts exactly. This function makes no authorization
 * decision of its own: it relies entirely on Storage RLS
 * (event_images_admin_delete -> internal.can_delete_event_image) to decide
 * whether the object may actually be removed. In particular it must never be
 * used to "pre-check" deletability and then assume that decision still
 * holds — a TOCTOU race remains (see the policies migration's own note).
 *
 * Supabase's `remove()` does not report per-key RLS refusals as an error; a
 * request is HTTP-successful either way, and the response's `data` array
 * only lists the keys that were *actually* removed. So:
 *   - "deleted": the key is confirmed gone (it appeared in `data`).
 *   - "uncollected": the call succeeded but the key did not come back —
 *     this covers "still referenced by some event" (RLS refused it),
 *     "already gone", and "never existed" indistinguishably. Callers must
 *     treat this the same as any other best-effort cleanup miss: log it,
 *     never fail the surrounding business operation because of it, and
 *     never report it to the client as an error.
 *   - "error": the Storage call itself failed (network/infrastructure).
 *     Same handling as "uncollected" from the caller's perspective — this
 *     is *never* grounds for undoing an already-committed DB mutation.
 */
export async function deleteEventImageBestEffort(
  supabase: SupabaseClient,
  key: string
): Promise<DeleteEventImageOutcome> {
  const { data, error } = await supabase.storage.from(BUCKET).remove([key]);

  if (error) {
    console.error("deleteEventImageBestEffort: Storage remove call failed", key, error.message);
    return "error";
  }

  const removed = (data ?? []).some((entry) => entry.name === key);
  if (!removed) {
    console.warn(
      "deleteEventImageBestEffort: object not removed (still referenced by an event, already gone, or never existed)",
      key
    );
    return "uncollected";
  }

  return "deleted";
}
