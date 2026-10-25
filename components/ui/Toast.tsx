"use client";

import { useEffect } from "react";

const DISPLAY_MS = 3000;

/**
 * Minimal auto-dismissing success notification. Fixed to the bottom of the
 * viewport so it never shifts surrounding layout (unlike an inline banner,
 * which would push content around when it appears/disappears).
 */
export function Toast({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, DISPLAY_MS);
    return () => clearTimeout(timer);
  }, [message, onDismiss]);

  return (
    <div role="status" aria-live="polite" className="fixed inset-x-0 bottom-6 z-50 flex justify-center px-4">
      <div className="rounded-full bg-foreground px-5 py-3 text-sm font-bold text-background shadow-lg">{message}</div>
    </div>
  );
}
