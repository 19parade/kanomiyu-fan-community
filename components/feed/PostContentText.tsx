import { splitContentIntoSegments } from "@/lib/links/extract";
import { stripTikTokEmbedCode } from "@/lib/links/tiktokEmbed";

/**
 * Renders post content (or its excerpt) with any URL segments turned into
 * real, clickable links — 2026-10-27 design review requirement ("テキスト
 * を載せるだけでは無くURLへ遷移できるように"). `relative z-10` on each link
 * is unconditional: it is required when this renders inside
 * components/feed/PostCard.tsx (whose own full-card navigation link sits
 * at z-0 behind it, see that component's doc comment) and is a harmless
 * no-op everywhere else (app/feed/[id]/page.tsx has no competing
 * absolutely-positioned sibling to stack above).
 *
 * stripTikTokEmbedCode() removes a pasted TikTok `<iframe>` embed tag
 * before display (user report, 2026-11-15) — the real embedded player
 * (components/feed/LinkPreviewCard.tsx) already renders separately below
 * this, from the same content's extracted URL, so showing the raw tag text
 * here too was pure noise. lib/posts/mapRows.ts's excerptContent() already
 * strips it before truncating for list-card excerpts; stripping again here
 * is the no-op case for those and the only case that matters for the full
 * content on app/feed/[id]/page.tsx.
 */
export function PostContentText({ content, className }: { content: string; className?: string }) {
  const segments = splitContentIntoSegments(stripTikTokEmbedCode(content));

  return (
    <p className={className}>
      {segments.map((segment, index) =>
        segment.type === "url" ? (
          <a
            key={index}
            href={segment.value}
            target="_blank"
            rel="noreferrer noopener"
            className="relative z-10 text-brand underline underline-offset-2 hover:no-underline"
          >
            {segment.value}
          </a>
        ) : (
          <span key={index}>{segment.value}</span>
        )
      )}
    </p>
  );
}
