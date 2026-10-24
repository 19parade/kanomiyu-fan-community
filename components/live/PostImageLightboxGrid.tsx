"use client";

import { useState } from "react";

export type PostImageDisplayItem = {
  key: string;
  url: string;
};

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
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={images[openIndex].url}
            alt=""
            className="max-h-full max-w-full rounded-lg object-contain"
            onClick={(event) => event.stopPropagation()}
          />
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
