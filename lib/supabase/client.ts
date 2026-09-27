"use client";

import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser-only Supabase client factory (A1). Uses the anon/publishable key
 * only — never a service_role key, which must never reach a browser bundle.
 *
 * Cookie handling is intentionally left at @supabase/ssr's default: per the
 * installed package's own doc comment (node_modules/@supabase/ssr/src/
 * createBrowserClient.ts), "In most cases you should not configure the
 * options.cookies object, as this is automatically handled for you."
 *
 * Singleton: createBrowserClient() already caches and returns a single
 * client instance per browser tab (see the same source file's
 * `cachedBrowserClient` / `shouldUseSingleton` logic — it defaults to true
 * whenever this runs in a browser). Calling this factory on every render is
 * therefore safe and does not create redundant client instances.
 */
export function createSupabaseBrowserClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error(
      "Supabase environment variables are not configured (NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)."
    );
  }

  return createBrowserClient(supabaseUrl, supabaseKey);
}
