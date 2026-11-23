import { AppleMusicIcon, LineMusicIcon, SpotifyIcon, YoutubeMusicIcon } from "@/components/music/StreamingIcons";

export type StreamingLinksProps = {
  spotifyUrl: string | null;
  appleMusicUrl: string | null;
  youtubeMusicUrl: string | null;
  lineMusicUrl: string | null;
  /** Icon pixel size — components/music/MusicList.tsx uses a smaller size than app/music/[id]/page.tsx's detail view. */
  size?: number;
  className?: string;
};

/**
 * Row of official-brand icon links to the song's streaming platform pages
 * (PM依頼 2026-11-23, styled after the icon-link pattern on
 * https://www.tunecore.co.jp/artists/the-seek). Each icon only renders when
 * that platform's URL is actually set (nullable per
 * supabase/migrations/20261123000000_songs_streaming_links.sql) — renders
 * nothing at all when none of the 4 are set, same "0件なら非表示" pattern
 * used elsewhere on this site (components/WhatsNew.tsx, etc.).
 *
 * Every link is `target="_blank"` + `rel="noreferrer noopener"` — these
 * always point at an external platform, never this site's own pages — and
 * uses each platform's own brand color (brandColor on the icon components)
 * so the row is recognizable at a glance, matching the referenced TuneCore
 * page's style rather than this site's usual monochrome icon convention.
 */
export function StreamingLinks({
  spotifyUrl,
  appleMusicUrl,
  youtubeMusicUrl,
  lineMusicUrl,
  size = 24,
  className,
}: StreamingLinksProps) {
  const links = [
    spotifyUrl ? { key: "spotify", url: spotifyUrl, label: "Spotifyで聴く", Icon: SpotifyIcon } : null,
    appleMusicUrl ? { key: "apple-music", url: appleMusicUrl, label: "Apple Musicで聴く", Icon: AppleMusicIcon } : null,
    youtubeMusicUrl
      ? { key: "youtube-music", url: youtubeMusicUrl, label: "YouTube Musicで聴く", Icon: YoutubeMusicIcon }
      : null,
    lineMusicUrl ? { key: "line-music", url: lineMusicUrl, label: "LINE MUSICで聴く", Icon: LineMusicIcon } : null,
  ].filter((link): link is NonNullable<typeof link> => link !== null);

  if (links.length === 0) {
    return null;
  }

  return (
    <div className={["flex flex-wrap items-center gap-2", className].filter(Boolean).join(" ")}>
      {links.map(({ key, url, label, Icon }) => (
        <a
          key={key}
          href={url}
          target="_blank"
          rel="noreferrer noopener"
          aria-label={label}
          title={label}
          className="relative z-10 inline-flex items-center justify-center rounded-full border border-border bg-surface p-1.5 transition-colors hover:border-brand focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          <Icon size={size} brandColor />
        </a>
      ))}
    </div>
  );
}
