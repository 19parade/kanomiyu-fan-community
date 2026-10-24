import { redirect } from "next/navigation";

import { AdminHeader } from "@/components/admin/AdminHeader";
import { requireActiveAdmin } from "@/lib/admin/authorize";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Common guard for everything under /admin (A1). This is the sole place
 * that decides admin access for this subtree — proxy.ts only refreshes the
 * session cookie and never performs authorization (see proxy.ts's own doc
 * comment), and client-side state is never trusted for this decision
 * (requireActiveAdmin() re-verifies server-side via `auth.getUser()` then
 * `public.is_admin()`, the same unduplicated check the existing ST3–ST5
 * Route Handlers already use).
 *
 * Unauthenticated -> redirect to /login (with `next` so login returns here).
 * Authenticated but not an active admin (covers ordinary users AND
 * suspended/banned admins, since public.is_admin() already returns false
 * for both) -> render an access-denied message instead of `children`.
 *
 * Known Next.js App Router limitation (reported, not worked around): this
 * access-denied branch renders as a normal successful RSC response, so the
 * raw HTTP status is 200, not 403. notFound() is deliberately not used
 * either — disguising "no admin rights" as a 404 is not this project's
 * intent (the admin area's existence is not a secret to protect).
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createSupabaseServerClient();
  const authResult = await requireActiveAdmin(supabase);

  if (!authResult.authorized) {
    if (authResult.reason === "UNAUTHENTICATED") {
      redirect("/login?next=/admin");
    }

    return (
      <main className="mx-auto max-w-md px-4 py-16 text-center sm:py-24">
        <h1 className="text-xl font-bold">アクセス権限がありません</h1>
        <p className="mt-2 text-sm text-muted">この画面は管理者のみ利用できます。</p>
      </main>
    );
  }

  return (
    <div className="flex min-h-full flex-col">
      <AdminHeader />
      {children}
    </div>
  );
}
