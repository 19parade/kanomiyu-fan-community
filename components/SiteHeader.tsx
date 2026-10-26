import Link from "next/link";

import { buttonClassName } from "@/components/ui/Button";
import { SITE_NAME } from "@/lib/legal/site-info";
import { getMemberAccess } from "@/lib/member/access";

const NAV_LINK_CLASS =
  "inline-block rounded-full px-3 py-2 text-sm font-bold text-foreground hover:bg-background";

/**
 * Site-wide header (bug-fix pass, 2026-10-22). Server Component: the
 * logged-in/out decision uses the same cookie-bound auth read that /me and
 * /feed already use (never client-only state), so it is correct on first
 * paint (no flash of the wrong links) and re-evaluates on every navigation
 * the same way those pages already do.
 *
 * 施策2（2026-10-27パフォーマンス調査）: uses getMemberAccess() — a
 * request-scoped memoized wrapper around resolveMemberAccess() (see
 * lib/member/access.ts's own doc comment) — instead of calling
 * resolveMemberAccess() directly. Since this header renders on every page
 * via the root layout, and the page itself typically calls the same check
 * again for its own logic, this avoids a second live auth.getUser() round
 * trip to Supabase Auth on every request. Purely a performance change: the
 * authorization *result* is identical to before, just computed once instead
 * of twice.
 *
 * Anything other than "unauthenticated" (member_active, admin_active, and
 * also suspended/banned/invalid) is treated as "signed in" for the purpose
 * of which links to show here; where someone in a restricted state actually
 * lands after clicking /me or /feed is still decided solely by those pages'
 * own existing redirect logic, not duplicated here.
 */
export async function SiteHeader() {
  const access = await getMemberAccess();
  const isSignedIn = access.kind !== "unauthenticated";

  return (
    <header className="border-b border-border bg-surface">
      <div className="mx-auto flex w-full max-w-3xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <Link href="/" className="text-sm font-bold text-foreground">
          {SITE_NAME}
        </Link>
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
            {isSignedIn ? (
              <>
                <li>
                  <Link href="/feed" className={NAV_LINK_CLASS}>
                    みんなの掲示板
                  </Link>
                </li>
                <li>
                  <Link href="/me" className={buttonClassName("secondary", "px-4 py-2 text-sm")}>
                    マイページ
                  </Link>
                </li>
              </>
            ) : (
              <>
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
              </>
            )}
          </ul>
        </nav>
      </div>
    </header>
  );
}
