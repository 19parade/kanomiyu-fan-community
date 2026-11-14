"use client";

import { useEffect, useRef, useState } from "react";

import { buttonClassName } from "@/components/ui/Button";
import { copyTextToClipboard } from "@/lib/share/clipboard";
import { generateStoryImage } from "@/lib/share/storyImage";

type Phase = "generating" | "ready" | "error";

type StorySharePreviewDialogProps = {
  pageType: "feed" | "live";
  title: string;
  url: string;
  onClose: () => void;
};

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';

/**
 * Instagram Stories image preview/share dialog (PM spec §5-2/§5-3/§6).
 *
 * Image generation starts as soon as this dialog opens, *before* the user
 * can click "共有する" — `navigator.share()` must be called synchronously
 * from a user gesture to count as "triggered by user activation" in most
 * browsers, so the async generation work is front-loaded and the share
 * button only appears once the file is already in hand (PM spec §5-2's
 * explicit "画像生成に時間がかかる場合は、先に画像を準備してから
 * 「共有する」ボタンを表示する" requirement).
 *
 * `navigator.share()` resolving only means the OS handed the file to
 * whatever the user picked in the system share sheet — it is never
 * reported back whether that target (e.g. Instagram) actually completed
 * anything with it, so no "投稿しました" / success wording is ever shown
 * after a share (PM spec §5-4 "Instagramへの投稿完了をWebサイト側で確認
 * できない場合、投稿成功と表示しない"). A user-cancelled share rejects
 * with `AbortError`, which is explicitly not treated as an error (§5-4).
 *
 * Accessibility: role="dialog" + aria-modal, initial focus moves into the
 * dialog, Escape closes, a minimal Tab/Shift+Tab focus trap keeps
 * keyboard focus inside while open, and focus returns to whatever was
 * focused before the dialog opened (normally the ShareMenu item that
 * opened it) on close.
 */
export function StorySharePreviewDialog({ pageType, title, url, onClose }: StorySharePreviewDialogProps) {
  const [phase, setPhase] = useState<Phase>("generating");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [canShareFiles, setCanShareFiles] = useState(false);
  const [shareFailed, setShareFailed] = useState(false);
  const [copyStatus, setCopyStatus] = useState<"idle" | "success" | "failed">("idle");
  const [generation, setGeneration] = useState(0);

  const dialogRef = useRef<HTMLDivElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    previouslyFocusedRef.current = document.activeElement as HTMLElement | null;
    return () => {
      previouslyFocusedRef.current?.focus();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;

    generateStoryImage({ pageType, title, url })
      .then((generatedBlob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(generatedBlob);
        setBlob(generatedBlob);
        setImageUrl(objectUrl);

        const file = new File([generatedBlob], "story.png", { type: "image/png" });
        const supportsFileShare =
          typeof navigator.canShare === "function" && navigator.canShare({ files: [file] });
        setCanShareFiles(supportsFileShare);
        setPhase("ready");
      })
      .catch((error) => {
        if (cancelled) return;
        console.error("story share dialog: image generation failed", error);
        setPhase("error");
      });

    return () => {
      cancelled = true;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [pageType, title, url, generation]);

  useEffect(() => {
    dialogRef.current?.focus();
  }, [phase]);

  function handleRetry() {
    setPhase("generating");
    setShareFailed(false);
    setGeneration((value) => value + 1);
  }

  async function handleShare() {
    if (!blob) return;
    const file = new File([blob], "story.png", { type: "image/png" });
    try {
      await navigator.share({ files: [file] });
    } catch (error) {
      if ((error as DOMException)?.name === "AbortError") {
        return; // User-cancelled share — not an error (PM spec §5-4).
      }
      console.error("story share dialog: navigator.share failed", error);
      setShareFailed(true);
    }
  }

  async function handleCopyUrl() {
    const result = await copyTextToClipboard(url);
    setCopyStatus(result.ok ? "success" : "failed");
  }

  function handleOpenInstagram() {
    window.open("https://www.instagram.com/", "_blank", "noopener,noreferrer");
  }

  function handleKeyDown(event: React.KeyboardEvent) {
    if (event.key === "Escape") {
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== "Tab" || !dialogRef.current) {
      return;
    }
    const focusable = Array.from(
      dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
    );
    if (focusable.length === 0) {
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  const showUnsupportedGuidance = phase === "ready" && (!canShareFiles || shareFailed);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Instagramストーリーズへ追加"
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={handleKeyDown}
        className="flex max-h-[90vh] w-full max-w-sm flex-col overflow-y-auto rounded-2xl border border-border bg-surface p-5"
      >
        <div className="flex items-center justify-between">
          <h2 className="font-bold">Instagramストーリーズへ追加</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="閉じる"
            className="rounded-full p-1 text-muted hover:bg-foreground/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            ×
          </button>
        </div>

        {phase === "generating" ? (
          <p className="mt-6 py-10 text-center text-sm text-muted" aria-live="polite">
            画像を生成しています...
          </p>
        ) : null}

        {phase === "error" ? (
          <div className="mt-6">
            <p role="alert" className="text-sm text-rose-700">
              画像の生成に失敗しました。
            </p>
            <button type="button" onClick={handleRetry} className={buttonClassName("secondary", "mt-3 w-full")}>
              再試行
            </button>
          </div>
        ) : null}

        {phase === "ready" && imageUrl ? (
          <>
            <div className="mt-4 overflow-hidden rounded-xl border border-border bg-foreground/5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imageUrl} alt="Instagramストーリーズ用プレビュー画像" className="mx-auto aspect-[9/16] max-h-[50vh] object-contain" />
            </div>

            <div className="mt-4 flex flex-col gap-2">
              {canShareFiles ? (
                <button type="button" onClick={() => void handleShare()} className={buttonClassName("primary", "w-full")}>
                  共有する
                </button>
              ) : null}

              <a
                href={imageUrl}
                download="kanomiyu-fan-community-story.png"
                className={buttonClassName("secondary", "w-full text-center")}
              >
                画像を保存
              </a>

              <button type="button" onClick={() => void handleCopyUrl()} className={buttonClassName("secondary", "w-full")}>
                URLをコピー
              </button>

              {!canShareFiles ? (
                <button type="button" onClick={handleOpenInstagram} className={buttonClassName("secondary", "w-full")}>
                  Instagramを開く
                </button>
              ) : null}

              <button type="button" onClick={onClose} className={buttonClassName("ghost", "w-full")}>
                閉じる
              </button>
            </div>

            {copyStatus === "success" ? (
              <p role="status" aria-live="polite" className="mt-2 text-center text-xs font-bold text-brand">
                URLをコピーしました
              </p>
            ) : null}
            {copyStatus === "failed" ? (
              <div className="mt-2">
                <p role="alert" className="text-xs text-rose-700">
                  コピーできませんでした。下の欄から手動でコピーしてください。
                </p>
                <input
                  type="text"
                  readOnly
                  value={url}
                  onFocus={(event) => event.currentTarget.select()}
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-xs"
                />
              </div>
            ) : null}

            {showUnsupportedGuidance ? (
              <p className="mt-3 text-xs leading-relaxed text-muted">
                画像を保存し、Instagramアプリのストーリーズから追加してください。リンクを付けたい場合は、Instagramのリンクスタンプにコピーした URL
                を設定してください。
              </p>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}
