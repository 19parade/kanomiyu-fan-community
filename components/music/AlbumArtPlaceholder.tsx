/**
 * D3: shared "no cover image" treatment for MusicList's grid cards and
 * SongCoverImage's detail view. Purely presentational (no props besides an
 * optional size hint) — never touches image-fetch/error-handling logic,
 * which stays in each caller.
 */
export function AlbumArtPlaceholder({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-gradient-to-br from-brand/15 via-surface to-accent/15 text-muted">
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        className={compact ? "h-6 w-6" : "h-10 w-10"}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M9 18V5l12-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm12-2a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
        />
      </svg>
      {!compact ? <span className="text-xs font-medium">画像なし</span> : null}
    </div>
  );
}
