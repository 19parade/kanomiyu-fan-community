/**
 * Server-only Storage lifecycle helper (ST5). Do not import this from a
 * Client Component — matches the existing convention in
 * lib/supabase/server.ts / lib/admin/authorize.ts (no `server-only` package
 * dependency in this repo; enforced by doc comment and by never being
 * imported from client code, not by a build-time guard).
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { deleteSongImageBestEffort } from "./delete";

const BUCKET = "song-images";

/**
 * ST5 cleanup constants. Kept here, not scattered across the route handler.
 *
 * CLEANUP_MIN_AGE_MS: the grace period (see ST5 report §2) between a Storage
 * object's creation and its earliest possible eligibility for cleanup. This
 * exists because ST3/ST4's own non-atomic upload-then-DB-mutation sequencing
 * (and any abandoned-client scenario) leaves a short window where a freshly
 * uploaded, not-yet-attached object is legitimately unreferenced but not an
 * orphan — it may still be seconds away from being attached to a song.
 *
 * MAX_SCAN_OBJECTS: an upper bound on how many Storage entries a single
 * cleanup request will examine, so a very large bucket cannot make one
 * request scan forever.
 *
 * MAX_CLEANUP_OBJECTS: an upper bound on how many objects a single cleanup
 * request will actually attempt to delete, independent of how many were
 * scanned (see scan_limit_reached vs. the candidate cap — ST5 report §84).
 *
 * PAGE_SIZE: the page size used for each Storage list() call; matches the
 * storage-js client's own default (see DEFAULT_SEARCH_OPTIONS in
 * node_modules/@supabase/storage-js/src/packages/StorageFileApi.ts).
 */
export const CLEANUP_MIN_AGE_MS = 24 * 60 * 60 * 1000;
export const MAX_SCAN_OBJECTS = 1000;
export const MAX_CLEANUP_OBJECTS = 100;
export const PAGE_SIZE = 100;

/**
 * The same object-key contract as internal.is_valid_song_image_key() (see
 * supabase/migrations/20260928150000_song_images_policies.sql): root-level
 * `{uuid}.{jpg|jpeg|png|webp}`, case-insensitive UUID, lowercase extension
 * only, no folder prefix, no trimming.
 *
 * This is deliberately duplicated here rather than round-tripped to the DB
 * per scanned object (there is no RPC exposed for it, and adding one would
 * be a migration, which ST5 does not do). It is NOT the same regex as
 * lib/song-images/validate.ts's output contract (that one is narrower and
 * only describes keys *this app* generates going forward: jpg, not jpeg).
 * Drift risk: if internal.is_valid_song_image_key()'s contract ever changes,
 * this constant must be updated in the same PR as that migration. It is a
 * frozen ST2 contract with no planned changes, so this risk is accepted and
 * documented rather than avoided by adding a network round-trip.
 */
const VALID_SONG_IMAGE_KEY_SHAPE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\.(jpg|jpeg|png|webp)$/;

export function isValidSongImageKeyShape(name: string): boolean {
  return VALID_SONG_IMAGE_KEY_SHAPE.test(name);
}

/**
 * Pure age-eligibility check, deliberately separated from any Storage/DB
 * call so it can be unit-tested for the 24h boundary without waiting real
 * time or mutating any object's real timestamp (see ST5 report §51).
 *
 * `createdAt` is exactly what the Storage list() response provides for
 * FileObject.created_at: a string, or null for a folder entry. Anything
 * that isn't a parsable, non-future date is treated as NOT eligible
 * (fail-safe — see ST5 report §18-19).
 */
export function isCleanupEligibleByAge(createdAt: string | null | undefined, cleanupStartedAt: Date): boolean {
  if (typeof createdAt !== "string" || createdAt.length === 0) {
    return false;
  }

  const created = new Date(createdAt);
  if (Number.isNaN(created.getTime())) {
    return false;
  }

  // A created_at in the future relative to this cleanup run is not treated
  // as "old enough" — it simply fails the age check (never raised as an
  // error, never a reason to delete).
  if (created.getTime() > cleanupStartedAt.getTime()) {
    return false;
  }

  return created.getTime() <= cleanupStartedAt.getTime() - CLEANUP_MIN_AGE_MS;
}

export type CleanupSummary = {
  scanned: number;
  eligible: number;
  deleted: number;
  skipped: number;
  failed: number;
  scan_limit_reached: boolean;
};

/**
 * Thrown only when the very first Storage list() page fails outright —
 * candidate discovery could not even begin. A later page failing (after at
 * least one page already succeeded) is treated as a partial scan instead
 * (see ST5 report §80): whatever candidates were already found are still
 * deleted and reported, never silently discarded.
 */
export class SongImageScanError extends Error {}

/**
 * Runs one cleanup pass: scan-then-delete (see ST5 report §81 — scanning is
 * fully separated from deletion so that a list() failure mid-scan cannot
 * cause a half-finished deletion; only complete candidate list is acted on).
 *
 * Discovery uses only the real Storage API (`list()`), never a direct SQL
 * query against storage.objects (see ST5 report §13). Final deletion
 * authority is never this function's own age/key check — every delete goes
 * through `deleteSongImageBestEffort()`, which calls the real Storage
 * `remove()` under the caller's own user-scoped session, so ST2's RLS
 * (`song_images_admin_delete` / `internal.can_delete_song_image()`)
 * re-confirms the current DB reference state at the moment of deletion,
 * closing the TOCTOU window between this scan and the actual delete (see
 * ST5 report §20-21). `supabase` must be a user-scoped, active-admin client
 * — never service_role (this function does not check authorization itself;
 * callers must have already done so, matching lib/admin/authorize.ts's
 * existing contract).
 */
export async function runSongImageCleanup(
  supabase: SupabaseClient,
  cleanupStartedAt: Date
): Promise<CleanupSummary> {
  let scanned = 0;
  let skippedFromScan = 0; // invalid key shape, found during scan (never became a delete candidate)
  let scanLimitReached = false;
  let pagesSucceeded = 0;
  const candidates: string[] = [];
  let offset = 0;

  outer: while (true) {
    if (candidates.length >= MAX_CLEANUP_OBJECTS) {
      break;
    }
    if (scanned >= MAX_SCAN_OBJECTS) {
      scanLimitReached = true;
      break;
    }

    const pageLimit = Math.min(PAGE_SIZE, MAX_SCAN_OBJECTS - scanned);

    const { data, error } = await supabase.storage.from(BUCKET).list("", {
      limit: pageLimit,
      offset,
      // Oldest-first, so a bucket larger than MAX_SCAN_OBJECTS still surfaces
      // its oldest (most cleanup-eligible) objects first rather than starving
      // behind a wall of recent ones (see ST5 report §83 for the empirical
      // verification of this sortBy against the real Storage backend, and
      // the residual risk if a future backend version stops honoring it).
      sortBy: { column: "created_at", order: "asc" },
    });

    if (error) {
      if (pagesSucceeded === 0) {
        throw new SongImageScanError(error.message);
      }
      // A later page failed after at least one page already succeeded:
      // treat as a partial scan and proceed with whatever was already found.
      break;
    }

    pagesSucceeded += 1;

    if (!data || data.length === 0) {
      break; // no more objects
    }

    for (const entry of data) {
      if (scanned >= MAX_SCAN_OBJECTS) {
        scanLimitReached = true;
        break outer;
      }
      scanned += 1;

      // Folder placeholder entries have id === null. Not expected under the
      // ST2 root-only key contract, but guarded defensively; never treated
      // as a candidate.
      if (entry.id === null) {
        continue;
      }

      if (!isValidSongImageKeyShape(entry.name)) {
        skippedFromScan += 1;
        continue;
      }

      if (!isCleanupEligibleByAge(entry.created_at, cleanupStartedAt)) {
        continue;
      }

      candidates.push(entry.name);
      if (candidates.length >= MAX_CLEANUP_OBJECTS) {
        break outer;
      }
    }

    offset += data.length;
    if (data.length < pageLimit) {
      break; // short page: this was the last one
    }
  }

  const eligible = candidates.length;
  let deleted = 0;
  let uncollected = 0;
  let failed = 0;

  for (const key of candidates) {
    try {
      const outcome = await deleteSongImageBestEffort(supabase, key);
      if (outcome === "deleted") {
        deleted += 1;
      } else if (outcome === "uncollected") {
        uncollected += 1;
      } else {
        failed += 1;
      }
    } catch (error) {
      // One candidate's unexpected failure must never abort the whole batch
      // or corrupt the counts for candidates already processed.
      console.error("song image cleanup: delete threw unexpectedly", key, error);
      failed += 1;
    }
  }

  return {
    scanned,
    eligible,
    deleted,
    // "uncollected" (still referenced by a song, or already gone) and
    // invalid-key-shape objects found during scan are both reported as
    // skipped: neither is a hard error, and neither was deleted.
    skipped: skippedFromScan + uncollected,
    failed,
    scan_limit_reached: scanLimitReached,
  };
}
