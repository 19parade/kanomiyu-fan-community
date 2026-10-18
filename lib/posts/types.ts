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
};

export type PublicPostDetail = {
  id: string;
  author_id: string;
  post_type: PostType;
  content: string;
  created_at: string;
  like_count: number;
  comment_count: number;
  author: PublicPostAuthor | null;
};

export type PublicComment = {
  id: string;
  author_id: string;
  content: string;
  created_at: string;
  author: PublicPostAuthor | null;
};
