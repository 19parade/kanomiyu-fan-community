import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { PostForm } from "@/components/feed/PostForm";
import { Card } from "@/components/ui/Card";
import { UNOFFICIAL_LABEL } from "@/lib/legal/site-info";
import { getMemberAccess } from "@/lib/member/access";

export const metadata: Metadata = {
  title: "新規投稿",
};

// Must re-evaluate profiles.status on every request (same reasoning as
// app/login/page.tsx / app/me/page.tsx) — never served from a cache.
export const dynamic = "force-dynamic";

/**
 * /feed/new — post creation (F5-D2). Authorization is re-verified here
 * independently of how the caller arrived (same pattern as app/me/page.tsx):
 * unauthenticated/invalid go to /login, suspended/banned go to
 * /account/status. Both member_active and admin_active may reach the form —
 * posts_insert_own's own WITH CHECK only requires is_active_user()
 * (status='active'), with no role restriction, so this page does not
 * impose a narrower rule than the DB itself already enforces.
 */
export default async function NewPostPage() {
  const access = await getMemberAccess();

  if (access.kind === "unauthenticated" || access.kind === "invalid") {
    redirect("/login");
  }
  if (access.kind === "suspended" || access.kind === "banned") {
    redirect("/account/status");
  }

  // access.kind === "member_active" or "admin_active" from here on.
  return (
    <main className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
      <p className="mb-4">
        <Link href="/feed" className="text-sm font-bold text-brand underline-offset-2 hover:underline">
          ← 投稿一覧へ戻る
        </Link>
      </p>

      <span className="inline-block rounded-full bg-foreground/5 px-3 py-1 text-xs font-bold text-muted">
        {UNOFFICIAL_LABEL}
      </span>
      <h1 className="mt-3 text-2xl font-bold sm:text-3xl">新規投稿</h1>

      <Card className="mt-6 p-6 sm:p-8">
        <PostForm mode="create" userId={access.userId} />
      </Card>
    </main>
  );
}
