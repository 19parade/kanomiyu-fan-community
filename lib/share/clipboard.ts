/**
 * Copies text to the clipboard via the async Clipboard API. Returns a
 * result instead of throwing: `navigator.clipboard` is unavailable on
 * non-secure origins and some embedded/in-app browsers, and
 * `writeText()` itself can reject (permission denied, no user gesture,
 * etc.) — callers (components/share/ShareMenu.tsx) fall back to a
 * manually-selectable text field on `ok: false`, per the PM spec's
 * explicit "失敗時はURLを手動でコピーできるようにする" requirement,
 * rather than silently failing.
 */
export async function copyTextToClipboard(text: string): Promise<{ ok: boolean }> {
  try {
    if (!navigator.clipboard?.writeText) {
      return { ok: false };
    }
    await navigator.clipboard.writeText(text);
    return { ok: true };
  } catch (error) {
    console.error("copyTextToClipboard: writeText failed", error);
    return { ok: false };
  }
}
