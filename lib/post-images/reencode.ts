"use client";

/**
 * LIVE機能 Phase 4-B: client-side image re-encoding before upload.
 *
 * Draws the selected file onto a `<canvas>` and re-exports it via
 * `canvas.toBlob()`. This is a deliberate, dependency-free way to satisfy
 * two PM requirements at once:
 *   - EXIF除去（位置情報を含む）: canvas drawing only ever carries pixel
 *     data — no metadata (EXIF, ICC profiles, etc.) survives a
 *     draw→toBlob() round trip. No separate EXIF-stripping library is
 *     needed.
 *   - 画像サイズの最適化: the long edge is capped at MAX_DIMENSION, which
 *     also makes staying under the 5MiB server-side limit far more likely
 *     for typical phone-camera photos.
 *
 * **This is a UX convenience only, never a security boundary** (PM
 * requirement: "ブラウザ側の処理はセキュリティ上信用できない前提で設計
 * してください"). A malicious client can skip this function entirely and
 * upload arbitrary bytes directly to Storage — the real enforcement is
 * Storage's own bucket MIME/size limits and the `internal.
 * is_valid_post_image_key()` key-format check in
 * supabase/migrations/20261026000001_post_images_storage.sql. This
 * function exists purely to produce a better-behaved file for the common
 * case (a real photo taken on a phone), not to validate anything.
 *
 * If the browser cannot decode the input as an image at all (corrupt file,
 * unsupported format, etc.), this returns `{ok:false}` so the caller can
 * abort the upload rather than send a broken file (PM requirement:
 * "処理失敗時はアップロードを中止する").
 */

const MAX_DIMENSION = 2000;
const SUPPORTED_OUTPUT_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

export type ReencodeResult = { ok: true; blob: Blob; mime: string } | { ok: false };

export async function reencodeImageFile(file: File): Promise<ReencodeResult> {
  // Prefer the original declared type when it's one of the 3 supported
  // output formats; otherwise fall back to JPEG (e.g. HEIC from an iPhone
  // camera — the browser can usually still decode it into an <img>, and
  // re-exporting as JPEG makes it uploadable even though the original type
  // isn't one of our 3 accepted MIME types). This is still just UX — the
  // server-side bucket MIME allowlist is the real gate.
  const outputMime = SUPPORTED_OUTPUT_MIME.has(file.type) ? file.type : "image/jpeg";

  let objectUrl: string;
  try {
    objectUrl = URL.createObjectURL(file);
  } catch {
    return { ok: false };
  }

  try {
    const image = await loadImage(objectUrl);
    if (!image) {
      return { ok: false };
    }

    const { width, height } = scaledDimensions(image.naturalWidth, image.naturalHeight);
    if (width <= 0 || height <= 0) {
      return { ok: false };
    }

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return { ok: false };
    }
    ctx.drawImage(image, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((result) => resolve(result), outputMime, 0.9);
    });

    if (!blob || blob.size <= 0) {
      return { ok: false };
    }

    return { ok: true, blob, mime: outputMime };
  } catch (error) {
    console.error("reencodeImageFile: failed", error);
    return { ok: false };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function scaledDimensions(width: number, height: number): { width: number; height: number } {
  const longEdge = Math.max(width, height);
  if (longEdge <= MAX_DIMENSION || longEdge <= 0) {
    return { width, height };
  }
  const scale = MAX_DIMENSION / longEdge;
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}
