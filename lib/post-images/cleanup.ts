/**
 * Server-only Storage lifecycle helper (LIVE機能 Phase 4-B), mirroring
 * lib/song-images/cleanup.ts's structure. One important difference from
 * that file: `post_images_storage_delete` (supabase/migrations/
 * 20261026000001_post_images_storage.sql) does NOT itself refuse to delete
 * a still-attached object — unlike song/event images, there is no "shared
 * by multiple records" case for post-images (image_key is UNIQUE in
 * post_images), so that RLS policy only checks ownership/admin, not
 * reference state. This means the "is this object still wanted by
 * anyone?" check that song-images gets for free from its DELETE policy
 * must be done explicitly here, by querying `post_images` for the scanned
 * keys *before* attempting any delete — never rely on the delete call
 * itself to refuse a referenced image.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { deletePostImageBestEffort } from "./delete";

const BUCKET = "post-images";

// Grace period before an unreferenced object is eligible for cleanup (PM
// requirement: "誤って有効な投稿画像を削除しないための猶予期間"). An image
// is uploaded to Storage *before* create_live_report_post() attaches it to
// a post, so a very recent unreferenced upload may simply be mid-submission
// — not an abandoned orphan yet.
export const CLEANUP_MIN_AGE_MS = 24 * 60 * 60 * 1000;
export const MAX_SCAN_OBJECTS = 1000;
export const MAX_CLEANUP_OBJECTS = 100;
export const PAGE_SIZE = 100;

const VALID_POST_IMAGE_KEY_SHAPE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\.(jpg|jpeg|png|webp)$/;

export function isValidPostImageKeyShape(name: string): boolean {
  return VALID_POST_IMAGE_KEY_SHAPE.test(name);
}

export function isCleanupEligibleByAge(createdAt: string | null | undefined, cleanupStartedAt: Date): boolean {
  if (typeof createdAt !== "string" || createdAt.length === 0) {
    return false;
  }
  const created = new Date(createdAt);
  if (Number.isNaN(created.getTime())) {
    return false;
  }
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

export class PostImageScanError extends Error {}

/**
 * Runs one cleanup pass: scan Storage -> batch-check `post_images` for
 * which scanned keys are still referenced -> delete only the unreferenced,
 * old-enough remainder. `supabase` must be a user-scoped, active-admin
 * client (post_images_select_admin / post_images_storage_delete's admin
 * branch) — never service_role; callers must have already authorized the
 * caller (see app/api/admin/post-images/cleanup/route.ts).
 */
export async function runPostImageCleanup(
  supabase: SupabaseClient,
  cleanupStartedAt: Date
): Promise<CleanupSummary> {
  let scanned = 0;
  let skippedFromScan = 0;
  let scanLimitReached = false;
  let pagesSucceeded = 0;
  const ageEligible: { name: string }[] = [];
  let offset = 0;

  outer: while (true) {
    if (scanned >= MAX_SCAN_OBJECTS) {
      scanLimitReached = true;
      break;
    }

    const pageLimit = Math.min(PAGE_SIZE, MAX_SCAN_OBJECTS - scanned);

    const { data, error } = await supabase.storage.from(BUCKET).list("", {
      limit: pageLimit,
      offset,
      sortBy: { column: "created_at", order: "asc" },
    });

    if (error) {
      if (pagesSucceeded === 0) {
        throw new PostImageScanError(error.message);
      }
      break;
    }

    pagesSucceeded += 1;

    if (!data || data.length === 0) {
      break;
    }

    for (const entry of data) {
      if (scanned >= MAX_SCAN_OBJECTS) {
        scanLimitReached = true;
        break outer;
      }
      scanned += 1;

      if (entry.id === null) {
        continue;
      }
      if (!isValidPostImageKeyShape(entry.name)) {
        skippedFromScan += 1;
        continue;
      }
      if (!isCleanupEligibleByAge(entry.created_at, cleanupStartedAt)) {
        continue;
      }

      ageEligible.push({ name: entry.name });
    }

    offset += data.length;
    if (data.length < pageLimit) {
      break;
    }
  }

  // Batch-check which of the age-eligible keys are still referenced by a
  // post_images row — these must never be deleted regardless of age.
  let referencedKeys = new Set<string>();
  if (ageEligible.length > 0) {
    const { data: referencedRows, error: referencedError } = await supabase
      .from("post_images")
      .select("image_key")
      .in(
        "image_key",
        ageEligible.map((entry) => entry.name)
      );

    if (referencedError) {
      // Fail-safe: if we cannot confirm which keys are referenced, delete
      // none of them this pass rather than risk removing a live image.
      console.error("runPostImageCleanup: post_images reference check failed", referencedError.message);
      return {
        scanned,
        eligible: 0,
        deleted: 0,
        skipped: skippedFromScan + ageEligible.length,
        failed: 0,
        scan_limit_reached: scanLimitReached,
      };
    }

    referencedKeys = new Set((referencedRows ?? []).map((row) => row.image_key as string));
  }

  const unreferenced = ageEligible.filter((entry) => !referencedKeys.has(entry.name));
  // Still-referenced-despite-being-old entries are never deleted — they are
  // legitimately attached posts' images, not orphans. Counted as skipped,
  // same as an invalid key shape found during scan.
  const referencedSkipped = ageEligible.length - unreferenced.length;
  const candidates = unreferenced.slice(0, MAX_CLEANUP_OBJECTS).map((entry) => entry.name);

  const eligible = candidates.length;
  let deleted = 0;
  let uncollected = 0;
  let failed = 0;

  for (const key of candidates) {
    try {
      const outcome = await deletePostImageBestEffort(supabase, key);
      if (outcome === "deleted") {
        deleted += 1;
      } else if (outcome === "uncollected") {
        uncollected += 1;
      } else {
        failed += 1;
      }
    } catch (error) {
      console.error("runPostImageCleanup: delete threw unexpectedly", key, error);
      failed += 1;
    }
  }

  return {
    scanned,
    eligible,
    deleted,
    skipped: skippedFromScan + uncollected + referencedSkipped,
    failed,
    scan_limit_reached: scanLimitReached,
  };
}
