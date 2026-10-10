"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { buttonClassName } from "@/components/ui/Button";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const INPUT_CLASS =
  "mt-1 w-full rounded-xl border border-border bg-background px-4 py-3 text-base text-foreground placeholder:text-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-50";

/**
 * Common login form (A1, generalized in F3-B — Client Component: needs
 * state, an event handler, and the browser Supabase client).
 *
 * On success, `signInWithPassword` already writes the session cookies
 * itself (the browser client manages this — see lib/supabase/client.ts).
 * This form does NOT decide where to go next: it navigates back to
 * `/login` itself (preserving `?next=` when present), and app/login/
 * page.tsx's server-side resolveMemberAccess() — the single source of
 * truth for role/status routing — makes the real decision from a fresh DB
 * read. Trusting the client to pick /admin vs /me vs /account/status here
 * would mean trusting whatever stale role/status the client last observed,
 * which is exactly what this design avoids.
 *
 * Navigation uses `router.push(...)` alone (the lint-preferred approach for
 * internal navigation — @next/next/no-location-assign-relative-
 * destination). Pairing it with `router.refresh()` was tried and then
 * deliberately removed: it fired a second, concurrent RSC request for the
 * same destination and was observed empirically (see A1 report) to
 * occasionally race the just-established session, briefly rendering
 * app/admin/layout.tsx's access-denied branch before a later request
 * succeeded. `router.push` to a new route already fetches fresh Server
 * Component data for that route, so the second request added no value —
 * only risk.
 */
export function LoginForm({ next }: { next?: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);

    let supabase;
    try {
      supabase = createSupabaseBrowserClient();
    } catch (clientError) {
      console.error("login: failed to create Supabase browser client", clientError);
      setError("ログインできませんでした。しばらくしてから再度お試しください。");
      setPending(false);
      return;
    }

    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });

    if (signInError) {
      // Deliberately generalized: never distinguish "no such account" from
      // "wrong password" (avoids unnecessary account enumeration). The raw
      // Supabase error message/stack is never shown to the browser.
      setError("メールアドレスまたはパスワードを確認してください。");
      setPending(false);
      return;
    }

    router.push(next ? `/login?next=${encodeURIComponent(next)}` : "/login");
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
      <div>
        <label htmlFor="email" className="block text-sm font-bold">
          メールアドレス
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          disabled={pending}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className={INPUT_CLASS}
        />
      </div>
      <div>
        <label htmlFor="password" className="block text-sm font-bold">
          パスワード
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          disabled={pending}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className={INPUT_CLASS}
        />
      </div>
      {error ? (
        <p role="alert" aria-live="polite" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
          {error}
        </p>
      ) : null}
      <button type="submit" disabled={pending} className={buttonClassName("primary", "w-full")}>
        {pending ? "ログイン中..." : "ログイン"}
      </button>
    </form>
  );
}
