import Link from "next/link";

import { Card } from "@/components/ui/Card";
import { isExternalNewsLink } from "@/lib/news/link";
import { formatNewsDate } from "@/lib/news/format";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const HOMEPAGE_NEWS_COUNT = 5;

type PublicNewsRow = {
  id: string;
  title: string;
  published_at: string;
  source_url: string | null;
  has_content: boolean;
};

/**
 * WHAT'S NEW（新着情報）block for the top page (PM依頼 2026-11-08).
 * Server Component: fetches directly via get_public_news() (see
 * supabase/migrations/20261108010000_news_public_list.sql), which is the
 * sole authority for the "published かつ published_at<=now()" visibility
 * rule — no additional filtering happens here. Requires no auth check (the
 * RPC itself is anon-callable), so this adds no extra Supabase round trip
 * beyond the one call below — consistent with the PM's performance
 * requirement not to add redundant auth checks or DB calls to the top page.
 *
 * Renders nothing at all when there are zero published items (PM spec:
 * "新着情報が0件の場合はブロックを非表示にする") — this intentionally
 * includes the heading, so a quiet period never leaves an empty-looking
 * section on the homepage.
 *
 * Each item's title is a link only when there is somewhere to go
 * (has_content -> this site's own /news/[id] detail page; otherwise
 * source_url, if present, used directly — see lib/news/link.ts for the
 * external/internal classification). When neither is present, the title and
 * date render as plain, non-interactive text per the PM spec's explicit
 * "本文・リンクが両方ない場合はクリック不可" requirement.
 */
export async function WhatsNew() {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.rpc("get_public_news", {
    page_size: HOMEPAGE_NEWS_COUNT,
    after_published_at: null,
    after_id: null,
  });

  if (error) {
    // Never let a news-fetch failure break the rest of the homepage —
    // log and render nothing, same as "0件" (fail closed, not open).
    console.error("WhatsNew: get_public_news failed", error.message);
    return null;
  }

  const news = (data ?? []) as PublicNewsRow[];

  if (news.length === 0) {
    return null;
  }

  return (
    <section className="mx-auto w-full max-w-3xl px-4 pt-10 sm:px-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">WHAT&apos;S NEW</h2>
        <p className="mt-1 text-sm text-muted">- 新着情報 -</p>
      </div>

      <Card className="mt-6 divide-y divide-border p-0">
        {news.map((item) => {
          const href = item.has_content ? `/news/${item.id}` : item.source_url;
          const dateLabel = formatNewsDate(item.published_at);

          if (href === null) {
            return (
              <div key={item.id} className="flex flex-col gap-1 px-4 py-4 sm:flex-row sm:items-baseline sm:gap-4 sm:px-6">
                <span className="shrink-0 text-sm text-muted">{dateLabel}</span>
                <span className="break-words font-bold">{item.title}</span>
              </div>
            );
          }

          const external = !item.has_content && isExternalNewsLink(href);
          const linkClassName =
            "flex flex-col gap-1 px-4 py-4 transition-colors hover:bg-foreground/5 focus:outline-none focus-visible:bg-foreground/5 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand sm:flex-row sm:items-baseline sm:gap-4 sm:px-6";
          const titleClassName = "break-words font-bold text-brand underline-offset-2 hover:underline";

          return external ? (
            <a key={item.id} href={href} target="_blank" rel="noreferrer noopener" className={linkClassName}>
              <span className="shrink-0 text-sm text-muted">{dateLabel}</span>
              <span className={titleClassName}>{item.title}</span>
            </a>
          ) : (
            <Link key={item.id} href={href} className={linkClassName}>
              <span className="shrink-0 text-sm text-muted">{dateLabel}</span>
              <span className={titleClassName}>{item.title}</span>
            </Link>
          );
        })}
      </Card>
    </section>
  );
}
