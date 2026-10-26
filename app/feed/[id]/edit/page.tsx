import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { PostForm } from "@/components/feed/PostForm";
import { Card } from "@/components/ui/Card";
import { UNOFFICIAL_LABEL } from "@/lib/legal/site-info";
import { getMemberAccess } from "@/lib/member/access";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const UUID_SHAPE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export const metadata: Metadata = {
  title: "投稿を編集",
};

export const dynamic = "force-dynamic";

/**
 * /feed/[id]/edit — post editing (F5-D2). Authorization: unauthenticated/
 * invalid → /login, suspended/banned → /account/status (same guard as
 * /feed/new). The post itself is then fetched with `author_id = <this
 * viewer>` AND `status = 'published'` combined into one query — if that
 * returns zero rows (not the owner, not published, or genuinely
 * nonexistent/RLS-invisible), this page redirects to the ordinary
 * /feed/[id] detail route rather than guessing a reason: that route's own
 * fetch will correctly show either the normal read-only post (visible but
 * not editable by this viewer) or a true 404 (not visible at all),
 * without this page needing to duplicate that visibility logic or leak
 * which case applied.
 */
export default async function EditPostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  if (!UUID_SHAPE.test(id)) {
    redirect(`/feed/${id}`);
  }

  const access = await getMemberAccess();

  if (access.kind === "unauthenticated" || access.kind === "invalid") {
    redirect("/login");
  }
  if (access.kind === "suspended" || access.kind === "banned") {
    redirect("/account/status");
  }

  const supabase = await createSupabaseServerClient();
  const { data: post, error } = await supabase
    .from("posts")
    .select("id, content")
    .eq("id", id)
    .eq("author_id", access.userId)
    .eq("status", "published")
    .maybeSingle<{ id: string; content: string }>();

  if (error) {
    console.error("post edit page: fetch failed", error.message);
    return (
      <main className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
        <h1 className="text-2xl font-bold sm:text-3xl">投稿を編集</h1>
        <p role="alert" className="mt-4 text-red-600">
          投稿の取得に失敗しました。しばらくしてから再度お試しください。
        </p>
      </main>
    );
  }

  if (!post) {
    redirect(`/feed/${id}`);
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
      <p className="mb-4">
        <Link href={`/feed/${id}`} className="text-sm font-bold text-brand underline-offset-2 hover:underline">
          ← 投稿へ戻る
        </Link>
      </p>

      <span className="inline-block rounded-full bg-foreground/5 px-3 py-1 text-xs font-bold text-muted">
        {UNOFFICIAL_LABEL}
      </span>
      <h1 className="mt-3 text-2xl font-bold sm:text-3xl">投稿を編集</h1>

      <Card className="mt-6 p-6 sm:p-8">
        <PostForm mode="edit" postId={post.id} initialContent={post.content} />
      </Card>
    </main>
  );
}
