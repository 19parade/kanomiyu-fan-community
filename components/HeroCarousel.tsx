"use client";

import Image from "next/image";
import { useRef, useState } from "react";

export type HeroImage = {
  src: string;
  alt: string;
  // CSS object-position value (e.g. "50% 20%") — each photo's subject sits
  // differently in frame, so this is per-image rather than one shared value.
  objectPosition: string;
};

// Below this horizontal touch movement (px), a touch is treated as a tap /
// scroll attempt, not a swipe — avoids accidentally changing slides on a
// small, unintentional finger movement.
const SWIPE_THRESHOLD_PX = 50;

// Plain-text ◀/▶ render as colorful emoji glyphs on iOS/Android's default
// font instead of the plain triangle PCs show (same issue already fixed in
// components/live/PostImageLightboxGrid.tsx) — an inline SVG sidesteps
// that entirely.
function ChevronIcon({ direction }: { direction: "left" | "right" }) {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" aria-hidden="true">
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
 * トップページのメインビジュアル（2026-11-08付PM方針）: 複数枚の写真を
 * 切り替えられるカーソル。方針通り、操作手段を画面サイズで分ける —
 * スマートフォン（sm未満）はスワイプ＋下部のドット表示のみ、
 * パソコン（sm以上）は◀▶ボタンのみを表示する（両方を常に出すのではなく、
 * 明示的に使い分ける指示のため）。
 *
 * 1枚しか渡されなかった場合は矢印・ドットとも表示しない（切り替える
 * 対象がないため）。
 */
export function HeroCarousel({ images }: { images: HeroImage[] }) {
  const [index, setIndex] = useState(0);
  const touchStartXRef = useRef<number | null>(null);

  if (images.length === 0) {
    return null;
  }

  const current = images[index];
  const hasMultiple = images.length > 1;

  function goPrev() {
    setIndex((value) => (value - 1 + images.length) % images.length);
  }

  function goNext() {
    setIndex((value) => (value + 1) % images.length);
  }

  return (
    <div
      className="relative aspect-[3/4] w-full select-none sm:aspect-[16/9] lg:aspect-[21/9]"
      onTouchStart={(event) => {
        touchStartXRef.current = event.touches[0]?.clientX ?? null;
      }}
      onTouchEnd={(event) => {
        const startX = touchStartXRef.current;
        touchStartXRef.current = null;
        if (startX === null || !hasMultiple) {
          return;
        }
        const endX = event.changedTouches[0]?.clientX ?? startX;
        const deltaX = endX - startX;
        if (Math.abs(deltaX) < SWIPE_THRESHOLD_PX) {
          return;
        }
        if (deltaX < 0) {
          goNext();
        } else {
          goPrev();
        }
      }}
    >
      <Image
        src={current.src}
        alt={current.alt}
        fill
        priority
        sizes="100vw"
        className="object-cover"
        style={{ objectPosition: current.objectPosition }}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />

      {hasMultiple ? (
        <>
          <button
            type="button"
            onClick={goPrev}
            aria-label="前の画像"
            className="absolute left-3 top-1/2 hidden -translate-y-1/2 rounded-full bg-black/50 p-2 text-white hover:bg-black/70 sm:flex"
          >
            <ChevronIcon direction="left" />
          </button>
          <button
            type="button"
            onClick={goNext}
            aria-label="次の画像"
            className="absolute right-3 top-1/2 hidden -translate-y-1/2 rounded-full bg-black/50 p-2 text-white hover:bg-black/70 sm:flex"
          >
            <ChevronIcon direction="right" />
          </button>

          <div className="absolute inset-x-0 bottom-2 flex justify-center gap-2 sm:hidden">
            {images.map((image, i) => (
              <button
                key={image.src}
                type="button"
                onClick={() => setIndex(i)}
                aria-label={`${i + 1}枚目の画像を表示`}
                aria-current={i === index}
                className={`h-2 w-2 rounded-full ${i === index ? "bg-white" : "bg-white/40"}`}
              />
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
