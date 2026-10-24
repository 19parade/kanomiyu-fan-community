import type { SupabaseClient } from "@supabase/supabase-js";

const BUCKET = "post-images";

export type DeletePostImageOutcome = "deleted" | "uncollected" | "error";

/**
 * Best-effort delete of a post-images object, through the user-scoped
 * Storage API (never service_role). Mirrors lib/event-images/delete.ts /
 * lib/song-images/delete.ts exactly, but against the `post_images_storage_
 * delete` policy (owner_id = auth.uid() OR is_admin() — see
 * supabase/migrations/20261026000001_post_images_storage.sql). Unlike the
 * song/event-image policies, this one does *not* additionally require "not
 * referenced elsewhere" (post_images.image_key is UNIQUE, so a Storage
 * object can never legitimately be attached to more than one post — there
 * is no "still used by a different record" case to protect against here).
 * Callers that must not delete a currently-attached image are responsible
 * for that check themselves (see app/api/live-posts/[id]/delete/route.ts's
 * ordering).
 */
export async function deletePostImageBestEffort(
  supabase: SupabaseClient,
  key: string
): Promise<DeletePostImageOutcome> {
  const { data, error } = await supabase.storage.from(BUCKET).remove([key]);

  if (error) {
    console.error("deletePostImageBestEffort: Storage remove call failed", key, error.message);
    return "error";
  }

  const removed = (data ?? []).some((entry) => entry.name === key);
  if (!removed) {
    console.warn("deletePostImageBestEffort: object not removed (already gone, or never existed)", key);
    return "uncollected";
  }

  return "deleted";
}
