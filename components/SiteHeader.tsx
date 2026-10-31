import Link from "next/link";

import { SiteNav } from "@/components/SiteNav";
import { SITE_NAME } from "@/lib/legal/site-info";
import { getMemberAccess } from "@/lib/member/access";

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
 *
 * The nav itself is rendered by the SiteNav Client Component (needs
 * usePathname() for the current-page highlight, which an async Server
 * Component can't call) — only the signed-in/out boolean crosses that
 * boundary, so the auth check itself stays server-side.
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
        <SiteNav isSignedIn={isSignedIn} />
      </div>
    </header>
  );
}
