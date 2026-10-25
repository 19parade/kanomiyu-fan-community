import Link from "next/link";

import { AvatarInitial } from "@/components/ui/AvatarInitial";
import { Card } from "@/components/ui/Card";
import { LinkPreviewCard } from "@/components/feed/LinkPreviewCard";
import { PostContentText } from "@/components/feed/PostContentText";
import { formatPostDate, UNAVAILABLE_AUTHOR_LABEL } from "@/lib/posts/format";
import type { PublicPostListItem } from "@/lib/posts/types";

const POST_TYPE_LABEL: Record<string, string> = {
  normal: "通常投稿",
  live_report: "LIVEレポート",
};

/**
 * F5-D1: read-only post card for /feed. 2026-10-27 design review: the card
 * still navigates to /feed/[id] as a whole, but via an absolutely
 * positioned overlay `<Link>` at z-0 rather than wrapping every element —
 * this lets the two genuinely separate links inside (a URL inline in the
 * text, and the link-preview card) sit above it at z-10 and intercept
 * their own clicks (navigating to the external URL, not the post detail —
 * matching ordinary social-feed behavior), instead of producing invalid
 * nested `<a>` tags. No edit, delete, comment, like, or report affordances
 * exist yet (out of scope this phase).
 */
export function PostCard({ post }: { post: PublicPostListItem }) {
  const authorLabel = post.author?.display_name ?? UNAVAILABLE_AUTHOR_LABEL;

  return (
    <Card className="relative p-4 transition-shadow hover:shadow-md">
      <Link
        href={`/feed/${post.id}`}
        aria-label={`${authorLabel}さんの投稿を見る`}
        className="absolute inset-0 z-0 rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
      />

      <div className="pointer-events-none flex items-center gap-3">
        <AvatarInitial label={authorLabel} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-bold">{authorLabel}</p>
          {post.author ? <p className="truncate text-sm text-muted">@{post.author.username}</p> : null}
        </div>
        <span className="shrink-0 rounded-full bg-foreground/5 px-2 py-1 text-xs font-bold text-muted">
          {POST_TYPE_LABEL[post.post_type] ?? post.post_type}
        </span>
      </div>

      <PostContentText
        content={post.excerpt}
        className="relative mt-3 whitespace-pre-wrap text-sm leading-relaxed [overflow-wrap:anywhere]"
      />

      {post.linkPreview && post.linkPreviewUrl ? (
        <LinkPreviewCard url={post.linkPreviewUrl} preview={post.linkPreview} />
      ) : null}

      <div className="pointer-events-none mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
        <span>{formatPostDate(post.created_at)}</span>
        <span>いいね {post.like_count}</span>
        <span>コメント {post.comment_count}</span>
      </div>
    </Card>
  );
}
