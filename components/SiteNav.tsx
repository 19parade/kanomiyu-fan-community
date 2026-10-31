"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { buttonClassName } from "@/components/ui/Button";

const NAV_LINK_CLASS =
  "inline-block rounded-full px-2 py-2 text-sm font-bold text-foreground hover:bg-background sm:px-3";

// Deliberately not buttonClassName("secondary", "px-3 py-1.5 ...") here:
// buttonClassName's BASE already hardcodes px-6/py-3, and a same-property
// Tailwind utility passed as an "override" string doesn't reliably beat it
// (CSS rule order in the compiled stylesheet, not className string order,
// decides the winner) — confirmed via computed styles while fixing this,
// which is also why the old マイページ pill was wider than its "px-4 py-2"
// override implied. Writing the visual style directly here avoids that.
const ACTIVE_LINK_CLASS =
  "inline-block rounded-full border border-border bg-surface px-3 py-1.5 text-sm font-bold text-foreground hover:bg-background focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:px-4 sm:py-2";

type NavItem = {
  href: string;
  label: string;
  isActive: (pathname: string) => boolean;
};

const SIGNED_IN_ITEMS: NavItem[] = [
  { href: "/", label: "ホーム", isActive: (p) => p === "/" },
  { href: "/live", label: "LIVE", isActive: (p) => p === "/live" || p.startsWith("/live/") },
  { href: "/feed", label: "みんなの掲示板", isActive: (p) => p === "/feed" || p.startsWith("/feed/") },
  { href: "/me", label: "マイページ", isActive: (p) => p === "/me" },
];

/**
 * Client Component: only the nav itself needs `usePathname()` (not
 * available to SiteHeader's async Server Component), so this stays as
 * small as possible — the signed-in/out decision is still resolved
 * server-side in SiteHeader and passed down as `isSignedIn`, keeping the
 * no-flash-of-wrong-links guarantee described there.
 *
 * Bug fix (2026-10-31, user report): previously マイページ was always
 * rendered as the pill/button style regardless of which page was active,
 * and that extra padding was what pushed it onto its own line on mobile.
 * Now exactly one item — whichever page is currently open — gets the pill
 * style; the rest render as plain nav links (narrower), which is both the
 * requested "highlight the current page" behavior and what keeps the row
 * on one line on narrow viewports.
 */
export function SiteNav({ isSignedIn }: { isSignedIn: boolean }) {
  const pathname = usePathname();

  if (!isSignedIn) {
    return (
      <nav aria-label="メインナビゲーション">
        <ul className="flex flex-wrap items-center gap-1 sm:gap-2">
          <li>
            <Link href="/" className={NAV_LINK_CLASS}>
              ホーム
            </Link>
          </li>
          <li>
            <Link href="/live" className={`${NAV_LINK_CLASS} text-brand`}>
              LIVE
            </Link>
          </li>
          <li>
            <Link href="/signup" className={buttonClassName("secondary", "px-4 py-2 text-sm")}>
              会員登録
            </Link>
          </li>
          <li>
            <Link href="/login" className={buttonClassName("ghost", "px-4 py-2 text-sm")}>
              ログイン
            </Link>
          </li>
        </ul>
      </nav>
    );
  }

  return (
    <nav aria-label="メインナビゲーション">
      <ul className="flex flex-wrap items-center gap-0.5 sm:gap-2">
        {SIGNED_IN_ITEMS.map((item) => {
          const active = item.isActive(pathname);
          const className =
            item.href === "/live" && !active ? `${NAV_LINK_CLASS} text-brand` : active ? ACTIVE_LINK_CLASS : NAV_LINK_CLASS;
          return (
            <li key={item.href}>
              <Link href={item.href} className={className} aria-current={active ? "page" : undefined}>
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
