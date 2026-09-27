import type { SupabaseClient } from "@supabase/supabase-js";

const BUCKET = "song-images";

export type DeleteSongImageOutcome = "deleted" | "uncollected" | "error";

/**
 * Best-effort delete of a song-images object, through the user-scoped
 * Storage API (never service_role — see lib/supabase/server.ts). This
 * function makes no authorization decision of its own: it relies entirely
 * on Storage RLS (song_images_admin_delete -> internal.can_delete_song_image)
 * to decide whether the object may actually be removed. In particular it
 * must never be used to "pre-check" deletability and then assume that
 * decision still holds — the ST2/ST4 TOCTOU note applies (see report).
 *
 * Supabase's `remove()` does not report per-key RLS refusals as an error;
 * a request is HTTP-successful either way, and the response's `data` array
 * only lists the keys that were *actually* removed. So:
 *   - "deleted": the key is confirmed gone (it appeared in `data`).
 *   - "uncollected": the call succeeded but the key did not come back —
 *     this covers "still referenced by some song" (RLS refused it),
 *     "already gone", and "never existed" indistinguishably. Callers must
 *     treat this the same as any other best-effort cleanup miss: log it,
 *     never fail the surrounding business operation because of it, and
 *     never report it to the client as an error.
 *   - "error": the Storage call itself failed (network/infrastructure).
 *     Same handling as "uncollected" from the caller's perspective — this
 *     is *never* grounds for undoing an already-committed DB mutation.
 *
 * A non-"deleted" outcome does not mean the object is an orphan — it may
 * still be legitimately referenced by a different song (see ST4 report,
 * "another-song reference"). Orphan detection is ST5's responsibility, not
 * this function's.
 */
export async function deleteSongImageBestEffort(
  supabase: SupabaseClient,
  key: string
): Promise<DeleteSongImageOutcome> {
  const { data, error } = await supabase.storage.from(BUCKET).remove([key]);

  if (error) {
    console.error("deleteSongImageBestEffort: Storage remove call failed", key, error.message);
    return "error";
  }

  const removed = (data ?? []).some((entry) => entry.name === key);
  if (!removed) {
    console.warn(
      "deleteSongImageBestEffort: object not removed (still referenced by a song, already gone, or never existed)",
      key
    );
    return "uncollected";
  }

  return "deleted";
}
