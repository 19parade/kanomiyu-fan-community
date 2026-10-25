/**
 * F5-D1: shared read-only types for the public post feed (/feed,
 * /feed/[id]). Mirrors the public-6-column shape get_public_profiles() /
 * get_public_profile() already establish for profiles — author here is
 * never widened beyond id/username/display_name/avatar_url.
 */

export type PublicPostAuthor = {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
};

export type PostType = "normal" | "live_report";

/**
 * Cached metadata for the first URL found in a post's content — resolved
 * from the shared public.link_previews cache table (see supabase/
 * migrations/20261027000000_link_previews.sql). `null` on the post itself
 * means either no URL was found, or one was found but no successful
 * preview is cached for it yet (an unsupported/broken link, or one still
 * mid-retry) — callers must not distinguish the two, same as every other
 * "quietly render nothing extra" fallback in this codebase.
 */
export type PublicLinkPreview = {
  provider: "youtube" | "tiktok" | "x" | "generic";
  title: string | null;
  description: string | null;
  imageUrl: string | null;
  siteName: string | null;
};

/**
 * `author` is null when get_public_profiles_by_ids() did not return a row
 * for this author_id — e.g. the author was banned after publishing, or the
 * RPC call itself failed (lib/posts/authors.ts degrades to an empty map
 * rather than throwing). Callers must render a neutral fallback, never
 * crash or assume the author is always present.
 */
export type PublicPostListItem = {
  id: string;
  author_id: string;
  post_type: PostType;
  excerpt: string;
  created_at: string;
  like_count: number;
  comment_count: number;
  author: PublicPostAuthor | null;
  // The exact URL `linkPreview` was resolved for — always derived from the
  // row's *full* content server-side, never re-derived from `excerpt` on
  // the client (the first URL can sit past the excerpt's truncation
  // point, so re-extracting from `excerpt` could silently mismatch or miss
  // it entirely). `null` whenever `linkPreview` is `null`.
  linkPreviewUrl: string | null;
  linkPreview: PublicLinkPreview | null;
};

export type PublicPostDetail = {
  id: string;
  author_id: string;
  post_type: PostType;
  event_id: string | null;
  content: string;
  created_at: string;
  like_count: number;
  comment_count: number;
  author: PublicPostAuthor | null;
  linkPreviewUrl: string | null;
  linkPreview: PublicLinkPreview | null;
};

export type PublicComment = {
  id: string;
  author_id: string;
  content: string;
  created_at: string;
  author: PublicPostAuthor | null;
};
