import Link from "next/link";

import { buttonClassName } from "@/components/ui/Button";
import { SITE_NAME } from "@/lib/legal/site-info";
import { resolveMemberAccess } from "@/lib/member/access";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const NAV_LINK_CLASS =
  "inline-block rounded-full px-3 py-2 text-sm font-bold text-foreground hover:bg-background";

/**
 * Site-wide header (bug-fix pass, 2026-10-22). Server Component: the
 * logged-in/out decision uses the same cookie-bound resolveMemberAccess()
 * read that /me and /feed already use (never client-only state), so it is
 * correct on first paint (no flash of the wrong links) and re-evaluates on
 * every navigation the same way those pages already do — no new caching
 * behavior introduced.
 *
 * Anything other than "unauthenticated" (member_active, admin_active, and
 * also suspended/banned/invalid) is treated as "signed in" for the purpose
 * of which links to show here; where someone in a restricted state actually
 * lands after clicking /me or /feed is still decided solely by those pages'
 * own existing redirect logic, not duplicated here.
 */
export async function SiteHeader() {
  const supabase = await createSupabaseServerClient();
  const access = await resolveMemberAccess(supabase);
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
            {isSignedIn ? (
              <>
                <li>
                  <Link href="/feed" className={NAV_LINK_CLASS}>
                    投稿一覧
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
