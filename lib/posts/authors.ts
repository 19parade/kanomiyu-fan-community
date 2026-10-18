import type { SupabaseClient } from "@supabase/supabase-js";

import type { PublicPostAuthor } from "./types";

/**
 * F5-D1b: the result of an author batch lookup, explicitly distinguishing
 * two different "I don't have this author's info" situations that F5-D1
 * previously collapsed into the same empty-map outcome:
 *
 *   - `ok: true` — the RPC call itself succeeded. `authors` may still be
 *     missing entries for some/all requested ids (banned author, or
 *     bidirectionally blocked relative to the current viewer, or a
 *     genuinely nonexistent id — get_public_profiles_by_ids() never
 *     distinguishes these, by design: existence-oracle safe). Callers
 *     render those specific posts/comments normally, with a neutral
 *     per-item "author unavailable" placeholder — this is expected,
 *     everyday behavior, not an error.
 *   - `ok: false` — the RPC call itself failed (network/DB error). This is
 *     a real failure, not "no such author": callers must NOT render the
 *     page as if every author were simply missing (that would silently
 *     mislabel a backend outage as "these members don't exist"). The
 *     caller is expected to surface this as a genuine error state — see
 *     app/feed/page.tsx / app/feed/[id]/page.tsx / app/api/feed/route.ts,
 *     all of which now treat `ok: false` the same way they already treat
 *     their own posts/comments query failing.
 */
export type AuthorLookupResult =
  | { ok: true; authors: Map<string, PublicPostAuthor> }
  | { ok: false };

/**
 * Batch author lookup for post/comment lists, via
 * get_public_profiles_by_ids() (F5-C1 migration B — public 6 columns only,
 * banned excluded, bidirectional block applied for an authenticated
 * caller, no block filtering for anon — case C in F5-D1b §3: this function
 * never widens that RPC's own public range, never fetches anything else).
 * The RPC itself caps input at 50 distinct ids (TOO_MANY_PROFILE_IDS
 * beyond that); every caller of this function pages at ≤20 items, so a
 * single call's unique author count never approaches that cap (F5-D1b §4).
 */
export async function fetchAuthorsByIds(
  supabase: SupabaseClient,
  ids: string[]
): Promise<AuthorLookupResult> {
  const uniqueIds = Array.from(new Set(ids));
  if (uniqueIds.length === 0) {
    return { ok: true, authors: new Map() };
  }

  const { data, error } = await supabase.rpc("get_public_profiles_by_ids", {
    target_ids: uniqueIds,
  });

  if (error) {
    console.error("posts: get_public_profiles_by_ids failed", error.message);
    return { ok: false };
  }

  const rows = (data ?? []) as PublicPostAuthor[];
  return { ok: true, authors: new Map(rows.map((row) => [row.id, row])) };
}
