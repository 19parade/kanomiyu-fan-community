"use client";

import { useState } from "react";

export type PostImageDisplayItem = {
  key: string;
  url: string;
};

// Plain-text ◀/▶ render as colorful emoji glyphs on iOS/Android's default
// font (user report, 2026-10-31) instead of the plain triangle PCs show —
// an inline SVG renders identically everywhere, so it replaces them here
// rather than trying to force text presentation with a variation selector.
function ChevronIcon({ direction }: { direction: "left" | "right" }) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" aria-hidden="true">
      <path
        d={direction === "left" ? "M15 6l-6 6 6 6" : "M9 6l6 6-6 6"}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * LIVE機能 Phase 4-B: thumbnail grid + simple lightbox for a post's photos.
 * `url` values are already-signed, short-lived URLs resolved server-side
 * (see components/live/PostImageGallery.tsx) — this component never talks
 * to Supabase or Storage itself, it only renders what it's given.
 */
export function PostImageLightboxGrid({ images }: { images: PostImageDisplayItem[] }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  if (images.length === 0) {
    return null;
  }

  // Wrap around at both ends (common lightbox behavior) — never reached
  // with 0 photos (early return above) or while the lightbox is closed
  // (both buttons and the keyboard handler below only exist/fire once
  // openIndex is a real index).
  function goToPrev() {
    setOpenIndex((current) => (current === null ? current : (current - 1 + images.length) % images.length));
  }
  function goToNext() {
    setOpenIndex((current) => (current === null ? current : (current + 1) % images.length));
  }

  return (
    <>
      <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {images.map((image, index) => (
          <li key={image.key}>
            <button
              type="button"
              onClick={() => setOpenIndex(index)}
              className="block aspect-square w-full overflow-hidden rounded-xl border border-border focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={image.url} alt="" loading="lazy" className="h-full w-full object-cover" />
            </button>
          </li>
        ))}
      </ul>

      {openIndex !== null ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="写真の拡大表示"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setOpenIndex(null)}
          // Lets ←/→ move between photos and Esc close, without a mandatory
          // click first — focus goes on this div on open via autoFocus below
          // (it's the only focusable element here other than the buttons).
          tabIndex={-1}
          onKeyDown={(event) => {
            if (event.key === "ArrowLeft") {
              goToPrev();
            } else if (event.key === "ArrowRight") {
              goToNext();
            } else if (event.key === "Escape") {
              setOpenIndex(null);
            }
          }}
          autoFocus
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={images[openIndex].url}
            alt=""
            className="max-h-full max-w-full rounded-lg object-contain"
            onClick={(event) => event.stopPropagation()}
          />
          {images.length > 1 ? (
            <>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  goToPrev();
                }}
                aria-label="前の写真"
                className="absolute left-4 top-1/2 -translate-y-1/2 rounded-full bg-black/60 p-3 text-white"
              >
                <ChevronIcon direction="left" />
              </button>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  goToNext();
                }}
                aria-label="次の写真"
                className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full bg-black/60 p-3 text-white"
              >
                <ChevronIcon direction="right" />
              </button>
              <p className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-3 py-1 text-xs font-bold text-white">
                {openIndex + 1} / {images.length}
              </p>
            </>
          ) : null}
          <button
            type="button"
            onClick={() => setOpenIndex(null)}
            aria-label="閉じる"
            className="absolute right-4 top-4 rounded-full bg-black/60 px-3 py-2 text-sm font-bold text-white"
          >
            閉じる
          </button>
        </div>
      ) : null}
    </>
  );
}
