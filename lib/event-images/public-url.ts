import type { SupabaseClient } from "@supabase/supabase-js";

const BUCKET = "event-images";

/**
 * Resolves an `event-images` Storage object key (what `events.image_url`
 * stores — never a full URL) into a display URL, via the same
 * `getPublicUrl()` pattern as lib/song-images/public-url.ts.
 *
 * `getPublicUrl()` is a synchronous, purely local string construction — it
 * makes no network request and does not verify the object exists. The
 * `event-images` bucket has not been created yet (LIVE機能 Phase 1), so any
 * URL this returns will 404 when actually requested; callers must render a
 * placeholder on image load failure rather than assume the URL resolves.
 *
 * Returns null for a null/empty key so callers can render a fallback
 * instead of a broken `<img src="">`.
 */
export function getEventImagePublicUrl(supabase: SupabaseClient, key: string | null): string | null {
  if (!key) {
    return null;
  }

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(key);
  return data.publicUrl;
}
