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

  const images: PostImageDisplayItem[] = [];
  for (const row of imageRows) {
    const { data: signed, error: signError } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(row.image_key, SIGNED_URL_EXPIRES_IN_SECONDS);

    if (signError || !signed) {
      // Never block the rest of the gallery on one failed key — simply
      // omit it (e.g. a transient Storage error for a single object).
      console.error("PostImageGallery: createSignedUrl failed", row.image_key, signError?.message);
      continue;
    }

    images.push({ key: row.image_key, url: signed.signedUrl });
  }

  if (images.length === 0) {
    return null;
  }

  return <PostImageLightboxGrid images={images} />;
}
