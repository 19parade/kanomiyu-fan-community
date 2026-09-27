"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";

/**
 * A1's login form (Client Component — needs state, an event handler, and
 * the browser Supabase client).
 *
 * On success, `signInWithPassword` already writes the session cookies
 * itself (the browser client manages this — see lib/supabase/client.ts).
 * Navigation uses `router.push(nextPath)` alone (the lint-preferred
 * approach for internal navigation — @next/next/no-location-assign-
 * relative-destination). Pairing it with `router.refresh()` was tried and
 * then deliberately removed: it fired a second, concurrent RSC request for
 * the same destination and was observed empirically (see A1 report) to
 * occasionally race the just-established session, briefly rendering
 * app/admin/layout.tsx's access-denied branch before a later request
 * succeeded. `router.push` to a new route already fetches fresh Server
 * Component data for that route, so the second request added no value —
 * only risk.
 */
export function LoginForm({ nextPath }: { nextPath: string }) {
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

    router.push(nextPath);
  }

  return (
    <form onSubmit={handleSubmit}>
      <div>
        <label htmlFor="email">メールアドレス</label>
        <br />
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          disabled={pending}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </div>
      <div>
        <label htmlFor="password">パスワード</label>
        <br />
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          disabled={pending}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </div>
      {error ? (
        <p role="alert" aria-live="polite">
          {error}
        </p>
      ) : null}
      <button type="submit" disabled={pending}>
        {pending ? "ログイン中..." : "ログイン"}
      </button>
    </form>
  );
}
