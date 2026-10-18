import { CommentItem } from "@/components/feed/CommentItem";
import type { PublicComment } from "@/lib/posts/types";

/**
 * F5-D1 / F5-D3: comment list for /feed/[id]. Pagination/loading/error
 * state lives one level up in components/feed/CommentSection.tsx; this
 * component stays a thin list wrapper, delegating each row's own
 * view/edit/delete/report behavior to components/feed/CommentItem.tsx.
 */
export function CommentList({
  comments,
  currentUserId,
  canReport,
  isLoggedOut,
  onCommentUpdated,
  onCommentDeleted,
}: {
  comments: PublicComment[];
  currentUserId: string | null;
  canReport: boolean;
  isLoggedOut: boolean;
  onCommentUpdated: (comment: PublicComment) => void;
  onCommentDeleted: (commentId: string) => void;
}) {
  if (comments.length === 0) {
    return <p className="mt-4 text-sm text-muted">まだコメントはありません。</p>;
  }

  return (
    <ul className="mt-4 flex flex-col gap-4">
      {comments.map((comment) => (
        <CommentItem
          key={comment.id}
          comment={comment}
          currentUserId={currentUserId}
          canReport={canReport}
          isLoggedOut={isLoggedOut}
          onUpdated={onCommentUpdated}
          onDeleted={onCommentDeleted}
        />
      ))}
    </ul>
  );
}
