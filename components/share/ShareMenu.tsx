"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";

type ShareMenuProps = {
  triggerRef: RefObject<HTMLButtonElement | null>;
  onClose: () => void;
  onCopyUrl: () => void;
  onShareX: () => void;
  onShareInstagram: () => void;
  /** Rendered below the 3 menu items — used for the manual-copy fallback box. */
  extraContent?: ReactNode;
};

/**
 * The 3-option share popover (PM spec §2/§6), following the WAI-ARIA
 * "menu button" pattern: role="menu" + role="menuitem" children, Up/Down
 * arrow keys cycle focus between items, Escape closes and returns focus to
 * the trigger button (via `triggerRef`, focused in `onClose`'s caller —
 * see components/share/ShareButton.tsx), and a document-level pointerdown
 * listener closes the menu when clicking anywhere outside it or the
 * trigger (so the trigger's own click handler — which toggles the menu
 * open — isn't double-handled by both this listener and the button's own
 * onClick).
 *
 * Positioning: `position: fixed`, placed just under the trigger and
 * clamped to stay fully within the viewport horizontally (computed from
 * `getBoundingClientRect()`, which is already viewport-relative — exactly
 * what `fixed` needs). A pure `right-0`/`top-full` anchor (the original
 * implementation) assumes the trigger sits far enough from the left edge
 * for a fixed-width menu to fit to its left, which breaks the moment the
 * trigger itself ends up near the left edge — e.g. on a narrow phone
 * screen, when a long title wraps onto two lines and pushes the share
 * button onto its own line at the far left (user report, confirmed from
 * a screenshot: the menu ran off the left edge of the screen). Recomputed
 * on window resize/orientation change; closed on scroll so it never
 * visually detaches from a trigger that has moved out from under it.
 */
export function ShareMenu({
  triggerRef,
  onClose,
  onCopyUrl,
  onShareX,
  onShareInstagram,
  extraContent,
}: ShareMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    function computePosition() {
      const trigger = triggerRef.current;
      const menu = menuRef.current;
      if (!trigger || !menu) {
        return;
      }
      const triggerRect = trigger.getBoundingClientRect();
      const margin = 16;
      const menuWidth = menu.offsetWidth;
      // Default: align the menu's right edge with the trigger's right
      // edge (same visual anchor as the original right-0 design), then
      // clamp into [margin, viewportWidth - menuWidth - margin] so it
      // never crosses either edge regardless of where the trigger is.
      const idealLeft = triggerRect.right - menuWidth;
      const maxLeft = window.innerWidth - menuWidth - margin;
      const left = Math.min(Math.max(idealLeft, margin), Math.max(maxLeft, margin));
      setPosition({ top: triggerRect.bottom + 8, left });
    }

    computePosition();
    window.addEventListener("resize", computePosition);
    return () => window.removeEventListener("resize", computePosition);
  }, [triggerRef]);

  useEffect(() => {
    itemRefs.current[0]?.focus();
  }, []);

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (menuRef.current?.contains(target) || triggerRef.current?.contains(target)) {
        return;
      }
      onClose();
    }
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [onClose, triggerRef]);

  useEffect(() => {
    function handleScroll() {
      onClose();
    }
    window.addEventListener("scroll", handleScroll, { capture: true, passive: true });
    return () => window.removeEventListener("scroll", handleScroll, { capture: true });
  }, [onClose]);

  function focusItem(delta: number) {
    const items = itemRefs.current.filter((el): el is HTMLButtonElement => el !== null);
    if (items.length === 0) {
      return;
    }
    const currentIndex = items.findIndex((el) => el === document.activeElement);
    const nextIndex = (currentIndex + delta + items.length) % items.length;
    items[nextIndex]?.focus();
  }

  function handleKeyDown(event: React.KeyboardEvent) {
    if (event.key === "Escape") {
      event.stopPropagation();
      onClose();
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      focusItem(1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      focusItem(-1);
    }
  }

  const ITEM_CLASS =
    "flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-bold text-foreground hover:bg-foreground/5 focus:outline-none focus-visible:bg-foreground/5";

  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label="シェアメニュー"
      onKeyDown={handleKeyDown}
      style={position ? { top: position.top, left: position.left } : { top: 0, left: 0, visibility: "hidden" }}
      className="fixed z-20 w-72 rounded-2xl border border-border bg-surface p-2 shadow-lg"
    >
      <button
        type="button"
        role="menuitem"
        ref={(el) => {
          itemRefs.current[0] = el;
        }}
        onClick={onCopyUrl}
        className={ITEM_CLASS}
      >
        URLをコピー
      </button>
      <button
        type="button"
        role="menuitem"
        ref={(el) => {
          itemRefs.current[1] = el;
        }}
        onClick={onShareX}
        className={ITEM_CLASS}
      >
        Xに投稿
      </button>
      <button
        type="button"
        role="menuitem"
        ref={(el) => {
          itemRefs.current[2] = el;
        }}
        onClick={onShareInstagram}
        className={ITEM_CLASS}
      >
        Instagramストーリーズへ追加
      </button>
      {extraContent}
    </div>
  );
}
