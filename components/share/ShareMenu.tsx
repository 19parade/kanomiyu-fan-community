"use client";

import { useEffect, useRef, type ReactNode, type RefObject } from "react";

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
      className="absolute right-0 top-full z-20 mt-2 w-72 rounded-2xl border border-border bg-surface p-2 shadow-lg"
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
