/**
 * Plain inline SVG "share" (box with an upward/outward arrow) glyph —
 * never a Unicode emoji character, for the same reason
 * components/live/PostImageLightboxGrid.tsx's ChevronIcon isn't plain
 * text: an emoji glyph renders inconsistently (and often in full color)
 * across iOS/Android default fonts, while an inline SVG is pixel-identical
 * everywhere.
 */
export function ShareIcon({ size = 18 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      aria-hidden="true"
    >
      <path
        d="M12 15V4M12 4L8 8M12 4l4 4"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M5 13v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
