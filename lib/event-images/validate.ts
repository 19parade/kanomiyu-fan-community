/**
 * Pure, server-side validation for LIVE key-visual image uploads (LIVE機能
 * Phase 4-A). Mirrors lib/song-images/validate.ts exactly (same accepted
 * formats, same size limit, same magic-byte detection) — only renamed for
 * events. This module only inspects bytes/declared MIME/size and decides
 * whether an upload should be accepted, and if so which canonical extension
 * to use. It does not touch the network, Storage, or the database, and it
 * does not guarantee the image is "safe" in any deeper sense (no
 * re-encoding, no EXIF stripping, no full image parsing) — it only rejects
 * obviously mismatched or malformed input before it reaches Storage.
 *
 * The set of accepted formats mirrors the `event-images` bucket's
 * `allowed_mime_types` (see
 * supabase/migrations/20261025000000_event_images_bucket.sql) and the
 * object-key contract enforced by internal.is_valid_event_image_key() (see
 * supabase/migrations/20261025000001_event_images_policies.sql): jpg / jpeg /
 * png / webp only, lowercase extension.
 */

export const MAX_EVENT_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MiB, must match the bucket's file_size_limit.

export type SupportedEventImageMime = "image/jpeg" | "image/png" | "image/webp";
export type SupportedEventImageExtension = "jpg" | "png" | "webp";

const ALLOWED_MIME_TYPES: ReadonlySet<string> = new Set<SupportedEventImageMime>([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

const MIME_TO_CANONICAL_EXTENSION: Record<SupportedEventImageMime, SupportedEventImageExtension> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export type EventImageValidationError =
  | "EMPTY_FILE"
  | "FILE_TOO_LARGE"
  | "UNSUPPORTED_IMAGE_TYPE"
  | "IMAGE_TYPE_MISMATCH";

export type EventImageValidationResult =
  | { ok: true; mime: SupportedEventImageMime; extension: SupportedEventImageExtension }
  | { ok: false; error: EventImageValidationError };

/**
 * Inspects the leading bytes of a file and returns the image format it
 * actually is, based on well-known binary signatures ("magic bytes") —
 * never based on a filename or a client-supplied Content-Type. Returns null
 * if the bytes don't match any supported format (including when the input
 * is too short to contain a full signature).
 *
 * Identical logic to lib/song-images/validate.ts's detectImageMimeFromBytes
 * — not a full image parser, a deliberate scope limit shared with the song
 * implementation.
 */
export function detectEventImageMimeFromBytes(bytes: Uint8Array): SupportedEventImageMime | null {
  // JPEG: starts with FF D8 FF.
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }

  // PNG: fixed 8-byte signature.
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png";
  }

  // WebP: RIFF container (bytes 0-3) with a "WEBP" form type at bytes 8-11.
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }

  return null;
}

/**
 * Validates an uploaded LIVE key-visual image end to end and, on success,
 * returns the canonical extension to use for the generated Storage object
 * key. Order of checks (matches lib/song-images/validate.ts's
 * validateSongImage):
 *   1. size > 0
 *   2. size <= MAX_EVENT_IMAGE_BYTES
 *   3. declaredMime is one of the three allowed values
 *   4. magic-byte detection on the actual bytes
 *   5. detected format must equal the declared MIME (mismatch is rejected,
 *      not silently trusted either way)
 */
export function validateEventImage(
  bytes: Uint8Array,
  declaredMime: string
): EventImageValidationResult {
  if (bytes.byteLength <= 0) {
    return { ok: false, error: "EMPTY_FILE" };
  }

  if (bytes.byteLength > MAX_EVENT_IMAGE_BYTES) {
    return { ok: false, error: "FILE_TOO_LARGE" };
  }

  if (!ALLOWED_MIME_TYPES.has(declaredMime)) {
    return { ok: false, error: "UNSUPPORTED_IMAGE_TYPE" };
  }

  const detectedMime = detectEventImageMimeFromBytes(bytes);

  if (detectedMime === null) {
    return { ok: false, error: "UNSUPPORTED_IMAGE_TYPE" };
  }

  if (detectedMime !== declaredMime) {
    return { ok: false, error: "IMAGE_TYPE_MISMATCH" };
  }

  return { ok: true, mime: detectedMime, extension: MIME_TO_CANONICAL_EXTENSION[detectedMime] };
}
