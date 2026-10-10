"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { buttonClassName } from "@/components/ui/Button";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

/**
 * Logout (A1). Uses the browser Supabase client's own `signOut()` directly
 * from a Client Component, rather than a Route Handler or Server Action.
 *
 * Rationale (see A1 report for the full comparison): the same client that
 * established the session cookies at login is the one that clears them at
 * logout, avoiding any risk of the two clients disagreeing about cookie
 * format. A dedicated logout endpoint would add a new mutation surface (and
 * its own CSRF consideration) for an operation whose worst forgeable
 * outcome is merely logging the victim out — not worth a new server-side
 * route for A1.
 *
 * On success, `router.push("/login")` alone (see app/login/login-form.tsx
 * for why a second `router.refresh()` call is deliberately not paired with
 * it, and why this is preferred over a hard navigation).
 */
export function LogoutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleLogout() {
    setPending(true);
    setError(null);

    let supabase;
    try {
      supabase = createSupabaseBrowserClient();
    } catch (clientError) {
      console.error("logout: failed to create Supabase browser client", clientError);
      setError("ログアウトに失敗しました。もう一度お試しください。");
      setPending(false);
      return;
    }

    const { error: signOutError } = await supabase.auth.signOut();

    if (signOutError) {
      // Never claim success (and never navigate away) on failure — that
      // would let the caller believe they signed out while /admin access
      // is actually still live.
      console.error("logout: signOut failed", signOutError.message);
      setError("ログアウトに失敗しました。もう一度お試しください。");
      setPending(false);
      return;
    }

    router.push("/login");
  }

  return (
    <div>
      <button type="button" onClick={handleLogout} disabled={pending} className={buttonClassName("secondary")}>
        {pending ? "ログアウト中..." : "ログアウト"}
      </button>
      {error ? (
        <p role="alert" aria-live="polite" className="mt-2 text-sm text-rose-600">
          {error}
        </p>
      ) : null}
    </div>
  );
}
