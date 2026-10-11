import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

// Touches cookies and Supabase — Node.js runtime required (Edge is
// deprecated in this Next.js version), matching app/api/music/route.ts.
export const runtime = "nodejs";

type ErrorCode = "INVALID_CURSOR" | "INVALID_SEARCH" | "LIST_FAILED" | string;

function errorResponse(code: ErrorCode, status: number) {
  return NextResponse.json({ error: code }, { status, headers: { "Cache-Control": "no-store" } });
}

const UUID_SHAPE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const MAX_SEARCH_LENGTH = 100;

// The exact 6 columns get_public_profiles() returns (F4 audit) — never
// widened. In particular: no email, no role, no status, no consent info.
type PublicProfileRpcRow = {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  bio: string | null;
  fan_since: string | null;
};

// Server-fixed; not client-configurable (mirrors GET /api/music).
const PAGE_SIZE = 20;

/**
 * GET /api/fans
 *
 * Public pagination/search endpoint for "load more" and search on /fans
 * (F4-A). Thin wrapper around the existing get_public_profiles() RPC (F4
 * audit — see supabase/migrations/20260922072727_public_profile_rpcs.sql),
 * which is not modified and remains the sole authority for the
 * status/block filtering, keyset cursor semantics, and ordering.
 *
 * createSupabaseServerClient() is cookie-bound: an authenticated visitor's
 * own session reaches the RPC as themselves (so their block relationships
 * apply, per get_public_profiles()'s own authenticated branch), while a
 * visitor with no session cookie degrades to the RPC's anon branch — never
 * service_role, and never a client built from a fixed/shared anon key that
 * would discard the caller's actual cookies.
 *
 * Every response carries `Cache-Control: no-store`: results differ by
 * caller (block relationships), so this route must never be served from a
 * shared/CDN cache where one visitor's response could leak to another.
 *
 * Query parameters are pre-validated here for *shape* only, so a malformed
 * value never surfaces as a raw Postgres type-cast error — the RPC's own
 * INVALID_PROFILE_CURSOR remains the authority for the "after_username
 * without after_id (or vice versa)" case.
 */
export async function GET(request: Request) {
  let supabase;
  try {
    supabase = await createSupabaseServerClient();
  } catch (error) {
    console.error("public fans list: failed to create Supabase client", error);
    return errorResponse("LIST_FAILED", 500);
  }

  const url = new URL(request.url);
  const search = url.searchParams.get("search");
  const afterUsername = url.searchParams.get("after_username");
  const afterId = url.searchParams.get("after_id");

  if (search !== null && search.length > MAX_SEARCH_LENGTH) {
    return errorResponse("INVALID_SEARCH", 400);
  }

  if (afterId !== null && !UUID_SHAPE.test(afterId)) {
    return errorResponse("INVALID_CURSOR", 400);
  }

  const { data, error } = await supabase.rpc("get_public_profiles", {
    search,
    after_username: afterUsername,
    after_id: afterId,
    page_size: PAGE_SIZE,
  });

  if (error) {
    // get_public_profiles()'s only documented error is
    // INVALID_PROFILE_CURSOR (exactly one of after_username/after_id
    // given) — never surface the raw DB error message to the client.
    const code = error.message === "INVALID_PROFILE_CURSOR" ? "INVALID_CURSOR" : "LIST_FAILED";
    const status = error.message === "INVALID_PROFILE_CURSOR" ? 400 : 500;
    return errorResponse(code, status);
  }

  const rows = (data ?? []) as PublicProfileRpcRow[];
  const fans = rows.map((row) => ({
    id: row.id,
    username: row.username,
    display_name: row.display_name,
    avatar_url: row.avatar_url,
    bio: row.bio,
    fan_since: row.fan_since,
  }));

  return NextResponse.json(
    { fans, has_more: rows.length === PAGE_SIZE },
    { status: 200, headers: { "Cache-Control": "no-store" } }
  );
}
