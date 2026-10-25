import { NextResponse } from "next/server";

import { extractFirstUrl } from "@/lib/links/extract";
import { fetchLinkPreview } from "@/lib/links/providers";
import { isSameOriginRequest } from "@/lib/http/verify-same-origin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// SSRF defenses in lib/links/safeFetch.ts use node:dns / node:net, which do
// not exist on the Edge runtime.
export const runtime = "nodejs";

const MAX_URL_LENGTH = 2048;
const OK_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const ERROR_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 1 day — retry failed URLs sooner

type LinkPreviewRow = {
  url: string;
  provider: string;
  status: "ok" | "error";
  title: string | null;
  description: string | null;
  image_url: string | null;
  site_name: string | null;
  fetched_at: string;
};

function errorResponse(code: string, status: number) {
  return NextResponse.json({ ok: false, error: code }, { status, headers: { "Cache-Control": "no-store" } });
}

function toClientPreview(row: LinkPreviewRow) {
  if (row.status !== "ok") {
    return null;
  }
  return {
    provider: row.provider,
    title: row.title,
    description: row.description,
    imageUrl: row.image_url,
    siteName: row.site_name,
  };
}

function isFresh(row: LinkPreviewRow): boolean {
  const ageMs = Date.now() - new Date(row.fetched_at).getTime();
  return row.status === "ok" ? ageMs < OK_CACHE_TTL_MS : ageMs < ERROR_CACHE_TTL_MS;
}

/**
 * POST /api/link-preview — called by PostForm (create/edit) when the
 * first URL in the composed content changes, per the 2026-10-27 design
 * review: the actual outbound fetch to a user-supplied URL happens exactly
 * once, at post-creation/edit time, triggered by the authenticated poster's
 * own request — never on every later page view of the post. Rendering
 * (app/feed, app/feed/[id], app/live/[id]) only ever reads the resulting
 * cache row, never fetches on its own.
 *
 * Body: { content: string } — the URL to preview is derived server-side via
 * the same extractFirstUrl() rendering uses, so the client cannot ask this
 * endpoint to fetch an arbitrary URL unrelated to what will actually be
 * posted.
 */
export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return errorResponse("ORIGIN_INVALID", 403);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("INVALID_REQUEST", 400);
  }

  const content = (body as { content?: unknown })?.content;
  if (typeof content !== "string") {
    return errorResponse("INVALID_REQUEST", 400);
  }

  const url = extractFirstUrl(content);
  if (!url) {
    return NextResponse.json({ ok: true, preview: null }, { headers: { "Cache-Control": "no-store" } });
  }
  if (url.length > MAX_URL_LENGTH) {
    return errorResponse("URL_TOO_LONG", 400);
  }

  let supabase;
  try {
    supabase = await createSupabaseServerClient();
  } catch (error) {
    console.error("link-preview: failed to create Supabase client", error);
    return errorResponse("INTERNAL_ERROR", 500);
  }

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return errorResponse("UNAUTHORIZED", 401);
  }

  const { data: cached, error: cacheError } = await supabase
    .from("link_previews")
    .select("url,provider,status,title,description,image_url,site_name,fetched_at")
    .eq("url", url)
    .maybeSingle<LinkPreviewRow>();

  if (cacheError) {
    console.error("link-preview: cache lookup failed", cacheError.message);
    return errorResponse("INTERNAL_ERROR", 500);
  }

  if (cached && isFresh(cached)) {
    return NextResponse.json({ ok: true, preview: toClientPreview(cached) }, { headers: { "Cache-Control": "no-store" } });
  }

  // Cache miss (or stale) — gate the actual outbound fetch behind the
  // dedicated rate limit (consistent with PROJECT_SPEC's other per-feature
  // limits: live_report posts, reports, image uploads). A fresh cache hit
  // above never reaches this point, so normal usage never consumes it.
  const { error: rateLimitError } = await supabase.rpc("check_and_log_link_preview_fetch");
  if (rateLimitError) {
    const code = rateLimitError.message === "LINK_PREVIEW_FETCH_RATE_LIMITED" ? "RATE_LIMITED" : "UNAUTHORIZED";
    console.error("link-preview: rate limit check failed", rateLimitError.message);
    return errorResponse(code, code === "RATE_LIMITED" ? 429 : 401);
  }

  const result = await fetchLinkPreview(url);

  const { error: upsertError } = await supabase.rpc("upsert_link_preview", {
    p_url: url,
    p_provider: result.provider,
    p_status: result.status,
    p_title: result.status === "ok" ? result.title : null,
    p_description: result.status === "ok" ? result.description : null,
    p_image_url: result.status === "ok" ? result.imageUrl : null,
    p_site_name: result.status === "ok" ? result.siteName : null,
  });

  if (upsertError) {
    // The fetch itself already happened — still return its result to the
    // caller even if persisting the cache row failed (a later viewer will
    // simply cause a re-fetch, which is a correctness nit, not a failure of
    // this request).
    console.error("link-preview: upsert failed", upsertError.message);
  }

  if (result.status !== "ok") {
    return NextResponse.json({ ok: true, preview: null }, { headers: { "Cache-Control": "no-store" } });
  }

  return NextResponse.json(
    {
      ok: true,
      preview: {
        provider: result.provider,
        title: result.title,
        description: result.description,
        imageUrl: result.imageUrl,
        siteName: result.siteName,
      },
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
