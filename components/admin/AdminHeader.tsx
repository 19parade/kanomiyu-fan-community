"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { LogoutButton } from "@/app/admin/logout-button";
import { SITE_NAME } from "@/lib/legal/site-info";

const NAV_ITEMS = [
  { href: "/admin", label: "管理画面トップ" },
  { href: "/admin/music", label: "楽曲管理" },
  { href: "/admin/events", label: "LIVE管理" },
  { href: "/admin/reports", label: "通報管理" },
] as const;

/**
 * Shared chrome for everything under /admin — visual-only addition (no new
 * authorization logic; app/admin/layout.tsx's requireActiveAdmin() guard
 * remains the sole access boundary, this component renders only once that
 * guard has already let the request through).
 *
 * A Client Component (not Server) solely so usePathname() can drive the
 * active-link highlight without a second round-trip — there is no data
 * fetching here, so this carries none of the cost a data-fetching Client
 * Component would.
 *
 * Deliberately visually distinct from components/SiteHeader.tsx (the public
 * header): a dark surface + a small "管理画面" tag, so a screenshot alone
 * makes it obvious which side of the site is showing, rather than trying to
 * look like a public page with an admin label bolted on.
 */
export function AdminHeader() {
  const pathname = usePathname();

  return (
    <header className="border-b border-border bg-foreground text-background">
      <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <div className="flex flex-wrap items-center gap-3">
          <Link href="/admin" className="text-sm font-bold">
            {SITE_NAME}
          </Link>
          <span className="rounded-full bg-background/15 px-2 py-0.5 text-xs font-bold tracking-wide">
            管理画面
          </span>
        </div>

        <nav aria-label="管理画面ナビゲーション" className="flex flex-1 justify-end">
          <ul className="flex flex-wrap items-center gap-1 sm:gap-2">
            {NAV_ITEMS.map((item) => {
              const active = pathname === item.href || (item.href !== "/admin" && pathname?.startsWith(`${item.href}/`));
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={[
                      "inline-block rounded-full px-3 py-2 text-sm font-bold transition-colors",
                      active ? "bg-brand text-brand-foreground" : "text-background/85 hover:bg-background/10",
                    ].join(" ")}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
            <li>
              <Link
                href="/"
                className="inline-block rounded-full px-3 py-2 text-sm font-bold text-background/85 hover:bg-background/10"
              >
                サイトを見る
              </Link>
            </li>
          </ul>
        </nav>

        <LogoutButton />
      </div>
    </header>
  );
}
