import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AvatarInitial } from "@/components/ui/AvatarInitial";
import { Card } from "@/components/ui/Card";
import { UNOFFICIAL_LABEL } from "@/lib/legal/site-info";
import { buildPageMetadata } from "@/lib/seo/metadata";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// Matches the DB's actually-enforced constraint
// (profiles_username_signup_format_check /
// supabase/migrations/20260920120721_signup_db_foundation.sql) — every
// real username in the DB already satisfies this, so pre-rejecting
// anything else only ever filters out values that could never be a real
// username, and avoids an unnecessary RPC round-trip for them.
const USERNAME_SHAPE = /^[a-z0-9][a-z0-9_]{2,19}$/;

type PublicProfile = {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  bio: string | null;
  fan_since: string | null;
};

type FetchResult =
  | { kind: "found"; profile: PublicProfile }
  | { kind: "not_found" }
  | { kind: "error" };

/**
 * Fetches via the public, anonymous-accessible get_public_profile() RPC
 * (F4 audit — supabase/migrations/20260922072727_public_profile_rpcs.sql,
 * unchanged). That RPC itself already returns zero rows for a nonexistent
 * username, a banned profile, or (when called with a logged-in session) a
 * bidirectionally-blocked profile — all indistinguishable by design
 * (existence-oracle safe), matching get_public_song()'s precedent for
 * /music/[id].
 *
 * Unlike that precedent, an RPC *error* (network/DB failure) is kept
 * distinct from "zero rows" here, per this phase's explicit instruction:
 * a real backend failure must not be disguised as 404.
 */
async function fetchPublicProfile(username: string): Promise<FetchResult> {
  if (!USERNAME_SHAPE.test(username)) {
    return { kind: "not_found" };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("get_public_profile", { target_username: username });

  if (error) {
    console.error("fan profile: get_public_profile failed", error.message);
    return { kind: "error" };
  }

  const row = Array.isArray(data) ? data[0] : undefined;
  return row ? { kind: "found", profile: row as PublicProfile } : { kind: "not_found" };
}

function formatFanSince(value: string | null): string | null {
  if (!value) {
    return null;
  }
  const [year, month, day] = value.split("-").map(Number);
  return `${year}年${month}月${day}日から`;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ username: string }>;
}): Promise<Metadata> {
  const { username } = await params;
  const result = await fetchPublicProfile(username);

  // A banned/nonexistent/blocked username's real display_name never
  // reaches metadata — the generic fallback is used instead, same intent
  // as /music/[id]'s own not-found metadata.
  if (result.kind !== "found") {
    return { title: "ファンが見つかりません" };
  }

  const title = result.profile.display_name;
  const description = result.profile.bio?.slice(0, 120) ?? `${title}さんのファンプロフィールです。`;

  return buildPageMetadata({ title, description, path: `/fans/${result.profile.username}` });
}

// profiles.status can change between requests (e.g. banned after being
// indexed), and results also depend on the viewer's own session (block
// relationships) — this page must never be served from a shared cache.
// cookies() inside createSupabaseServerClient() already forces dynamic
// rendering; kept explicit as defense-in-depth (same pattern as
// app/login/page.tsx, app/me/page.tsx, app/account/status/page.tsx).
export const dynamic = "force-dynamic";

/**
 * /fans/[username] — public fan profile (F4-B). Server Component, no auth
 * guard: reachable by anonymous visitors, same as /fans and /music/[id].
 *
 * This segment deliberately has no loading.tsx of its own (same reasoning
 * as app/music/[id]/page.tsx's doc comment): with no Suspense boundary
 * above the notFound() call, Next.js renders this page to completion
 * server-side before streaming starts, so a nonexistent/banned/blocked
 * username gets a genuine HTTP 404 instead of a 200 "soft 404".
 */
export default async function FanProfilePage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const result = await fetchPublicProfile(username);

  if (result.kind === "not_found") {
    notFound();
  }

  if (result.kind === "error") {
    // A genuine backend failure — never disguised as 404, and never
    // leaking the raw DB error. Still a normal (200) render: this mirrors
    // app/music/(list)/page.tsx's own existing error-display precedent
    // rather than introducing a new file-convention boundary (error.tsx)
    // whose interaction with the true-404 streaming setup above was not
    // worth risking for this phase.
    return (
      <main className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
        <p className="mb-4">
          <Link href="/fans" className="text-sm font-bold text-brand underline-offset-2 hover:underline">
            ← ファン一覧へ戻る
          </Link>
        </p>
        <p role="alert" className="text-red-600">
          プロフィールの取得に失敗しました。しばらくしてから再度お試しください。
        </p>
      </main>
    );
  }

  const { profile } = result;
  const fanSinceText = formatFanSince(profile.fan_since);

  return (
    <main className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
      <p className="mb-4">
        <Link href="/fans" className="text-sm font-bold text-brand underline-offset-2 hover:underline">
          ← ファン一覧へ戻る
        </Link>
      </p>

      <span className="inline-block rounded-full bg-foreground/5 px-3 py-1 text-xs font-bold text-muted">
        {UNOFFICIAL_LABEL}
      </span>

      <Card className="mt-4 p-6 sm:p-8">
        <div className="flex items-center gap-4">
          <AvatarInitial label={profile.display_name} size="lg" />
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-bold break-words">{profile.display_name}</h1>
            <p className="truncate text-sm text-muted">@{profile.username}</p>
            {fanSinceText ? <p className="mt-1 text-xs text-muted">{fanSinceText}</p> : null}
          </div>
        </div>

        {profile.bio ? (
          <p className="mt-6 whitespace-pre-wrap break-words border-t border-border pt-6 text-sm leading-relaxed">
            {profile.bio}
          </p>
        ) : null}
      </Card>

      <div className="mt-4 rounded-2xl border border-dashed border-border px-6 py-5 text-sm leading-relaxed text-muted">
        投稿一覧・フォローなどの交流機能は、今後のフェーズで提供予定です。
      </div>
    </main>
  );
}
