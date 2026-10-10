import type { SupabaseClient } from "@supabase/supabase-js";

const BUCKET = "song-images";

/**
 * Resolves a `song-images` Storage object key (what `songs.cover_image_url`
 * actually stores — never a full URL) into a display URL, via the Supabase
 * Storage SDK's `getPublicUrl()`.
 *
 * `getPublicUrl()` is a synchronous, purely local string construction
 * (confirmed from node_modules/@supabase/storage-js/src/packages/
 * StorageFileApi.ts: it just builds `{url}/object/public/{bucket}/{path}`
 * via `encodeURI`) — it makes no network request, does not verify the
 * object actually exists, and carries no RLS requirement of its own. It
 * only produces a *working* URL because the bucket is public (ST1); this
 * helper does not change or re-litigate that trade-off.
 *
 * Never writes a resolved URL back to the DB (the DB only ever stores the
 * key) and never accepts an arbitrary caller-supplied URL — the only input
 * is a key already read from `songs.cover_image_url` via a trusted RPC.
 * Returns null for a null/empty key so callers can render a fallback
 * instead of a broken `<img src="">`.
 */
export function getSongImagePublicUrl(supabase: SupabaseClient, key: string | null): string | null {
  if (!key) {
    return null;
  }

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(key);
  return data.publicUrl;
}
