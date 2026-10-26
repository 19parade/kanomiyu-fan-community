import { PostImageLightboxGrid, type PostImageDisplayItem } from "./PostImageLightboxGrid";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const SIGNED_URL_EXPIRES_IN_SECONDS = 300; // 5 minutes — PM要件「有効期限は短めに」

const BUCKET = "post-images";

type PostImagesRow = {
  image_key: string;
  position: number;
};

/**
 * LIVE機能 Phase 4-B: Server Component that resolves a post's photos into
 * ready-to-use, already-signed display URLs.
 *
 * The browser never receives a raw Storage object key — only the final
 * signed URL — so this must run server-side, using the *viewer's own*
 * cookie-authenticated Supabase client (never service_role). `post_images`
 * itself is protected by RLS that duplicates the parent post's visibility
 * (published / community-browsing / bidirectional block — see
 * supabase/migrations/20261026000000_post_images.sql), so the SELECT below
 * already returns nothing for a post this viewer cannot see. The
 * `createSignedUrl()` call for each key is itself subject to the matching
 * Storage policy (post_images_storage_select_*, supabase/migrations/
 * 20261026000001_post_images_storage.sql), so a key that somehow slipped
 * through would still fail to produce a working URL — this component's own
 * SELECT is a fast-fail convenience, not the real authorization boundary.
 *
 * 施策4（2026-10-27パフォーマンス調査）: signs all of this post's images
 * (at most MAX_POST_IMAGES=4 — enforced by post_images' own `position
 * between 1 and 4` CHECK constraint, supabase/migrations/
 * 20261026000000_post_images.sql) with one call to Storage's batch
 * `createSignedUrls()` instead of one `createSignedUrl()` call per image in
 * a loop. This is strictly fewer network round trips than even a
 * `Promise.all()` of individual calls would be (one HTTP request total,
 * not up to four concurrent ones), so no separate concurrency limit is
 * needed on top of it — the 4-image cap already bounds how large that one
 * request's `paths` array can ever be. The 5-minute expiry
 * (SIGNED_URL_EXPIRES_IN_SECONDS) and the same per-object Storage RLS are
 * both unchanged: each entry in the batch response still carries its own
 * independent `error`/`signedUrl` (confirmed from this package's own
 * source, node_modules/@supabase/storage-js/src/packages/
 * StorageFileApi.ts), so one inaccessible or failed key still does not
 * block the others — the only change is that it is still indexed by the
 * returned `path`, not implied by call order, so this maps the response
 * back to each row explicitly rather than assuming the batch preserves
 * input order.
 */
export async function PostImageGallery({ postId }: { postId: string }) {
  const supabase = await createSupabaseServerClient();

  const { data: rows, error } = await supabase
    .from("post_images")
    .select("image_key, position")
    .eq("post_id", postId)
    .order("position", { ascending: true });

  if (error) {
    console.error("PostImageGallery: post_images query failed", error.message);
    return null;
  }

  const imageRows = (rows ?? []) as PostImagesRow[];
  if (imageRows.length === 0) {
    return null;
  }

  const { data: signedBatch, error: signError } = await supabase.storage
    .from(BUCKET)
    .createSignedUrls(
      imageRows.map((row) => row.image_key),
      SIGNED_URL_EXPIRES_IN_SECONDS
    );

  if (signError || !signedBatch) {
    // The whole batch call itself failed (e.g. network/Storage outage) —
    // never block the rest of the post on this, simply show no gallery.
    console.error("PostImageGallery: createSignedUrls failed", signError?.message);
    return null;
  }

  const signedByKey = new Map(signedBatch.map((entry) => [entry.path, entry]));

  const images: PostImageDisplayItem[] = [];
  for (const row of imageRows) {
    const signed = signedByKey.get(row.image_key);

    if (!signed || signed.error || !signed.signedUrl) {
      // Never block the rest of the gallery on one failed key — simply
      // omit it (e.g. a transient Storage error for a single object).
      console.error("PostImageGallery: signed URL missing for key", row.image_key, signed?.error);
      continue;
    }

    images.push({ key: row.image_key, url: signed.signedUrl });
  }

  if (images.length === 0) {
    return null;
  }

  return <PostImageLightboxGrid images={images} />;
}
