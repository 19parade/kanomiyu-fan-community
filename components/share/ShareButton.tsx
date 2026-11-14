"use client";

import { useRef, useState } from "react";

import { ShareIcon } from "@/components/share/ShareIcon";
import { ShareMenu } from "@/components/share/ShareMenu";
import { StorySharePreviewDialog } from "@/components/share/StorySharePreviewDialog";
import { Toast } from "@/components/ui/Toast";
import { copyTextToClipboard } from "@/lib/share/clipboard";
import { buildCanonicalShareUrl, buildShareLabel } from "@/lib/share/url";
import { buildXIntentUrl } from "@/lib/share/x";

export type ShareButtonProps = {
  /** Which detail page this is — drives the Stories image's badge label. */
  pageType: "feed" | "live";
  /**
   * The label used for the X post text and the Stories image's title line.
   * For /feed/[id] (posts have no title column) callers pass a short
   * excerpt of the post content; for /live/[id] callers pass the event's
   * own title. Computed by the caller, not this component (PM spec §7:
   * "ページのタイトル、種別、URLなどをpropsで渡す設計にしてください").
   */
  title: string;
  /** Canonical path, e.g. `/feed/${id}` or `/live/${id}` — no query/hash. */
  path: string;
};

/**
 * Shared share button for /feed/[id] and /live/[id] (PM spec §7). Renders
 * a compact icon+label trigger that opens a 3-option menu (URLをコピー /
 * Xに投稿 / Instagramストーリーズへ追加) — see components/share/ShareMenu.tsx
 * and components/share/StorySharePreviewDialog.tsx for the menu/dialog
 * implementations. Performs no DB writes of any kind (PM spec §8).
 */
export function ShareButton({ pageType, title, path }: ShareButtonProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [copyFallback, setCopyFallback] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const triggerRef = useRef<HTMLButtonElement>(null);

  const canonicalUrl = buildCanonicalShareUrl(path);

  function closeMenu() {
    setMenuOpen(false);
    setCopyFallback(false);
    triggerRef.current?.focus();
  }

  async function handleCopyUrl() {
    const result = await copyTextToClipboard(canonicalUrl);
    if (result.ok) {
      setMenuOpen(false);
      setCopyFallback(false);
      setToastMessage("URLをコピーしました");
    } else {
      // Keep the menu open and show a manually-selectable field instead —
      // PM spec §3's "失敗時はURLを手動でコピーできるようにする".
      setCopyFallback(true);
    }
  }

  function handleShareX() {
    const intentUrl = buildXIntentUrl({ text: buildShareLabel(title), url: canonicalUrl });
    window.open(intentUrl, "_blank", "noopener,noreferrer");
    setMenuOpen(false);
  }

  function handleShareInstagram() {
    setMenuOpen(false);
    setDialogOpen(true);
  }

  return (
    <div className="relative inline-block">
      <button
        type="button"
        ref={triggerRef}
        onClick={() => setMenuOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-bold text-foreground hover:bg-foreground/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
      >
        <ShareIcon size={16} />
        シェア
      </button>

      {menuOpen ? (
        <ShareMenu
          triggerRef={triggerRef}
          onClose={closeMenu}
          onCopyUrl={() => void handleCopyUrl()}
          onShareX={handleShareX}
          onShareInstagram={handleShareInstagram}
          extraContent={
            copyFallback ? (
              <div className="px-3 py-2">
                <p role="alert" className="text-xs text-rose-700">
                  コピーできませんでした。下の欄から手動でコピーしてください。
                </p>
                <input
                  type="text"
                  readOnly
                  value={canonicalUrl}
                  onFocus={(event) => event.currentTarget.select()}
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-xs"
                />
              </div>
            ) : null
          }
        />
      ) : null}

      {dialogOpen ? (
        <StorySharePreviewDialog
          pageType={pageType}
          title={title}
          url={canonicalUrl}
          onClose={() => setDialogOpen(false)}
        />
      ) : null}

      {toastMessage ? <Toast message={toastMessage} onDismiss={() => setToastMessage(null)} /> : null}
    </div>
  );
}
