"use client";

import Link from "next/link";
import { useCallback, useRef, useState, type FormEvent } from "react";

import { AvatarInitial } from "@/components/ui/AvatarInitial";
import { buttonClassName } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

export type PublicFanCard = {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  bio: string | null;
  fan_since: string | null;
};

function formatFanSince(value: string | null): string | null {
  if (!value) {
    return null;
  }
  // value is a DB `date` (YYYY-MM-DD) serialized as a plain string —
  // parsed only for display formatting, never sent back anywhere.
  const [year, month, day] = value.split("-").map(Number);
  return `${year}年${month}月${day}日から`;
}

/**
 * /fans — public fan directory (F4-A). Receives the Server Component's
 * initial page as props (no client-side fetch on first paint); search and
 * "load more" both go through GET /api/fans (see app/api/fans/route.ts),
 * never calling Supabase directly from the browser — same architecture as
 * components/music/MusicList.tsx.
 *
 * Each card links to /fans/[username] (F4-B). Search/pagination/cursor
 * logic above is unchanged from F4-A — only the card markup gained a
 * wrapping <Link>, matching MusicList.tsx's own card-is-the-link pattern.
 */
export function FansList({
  initialFans,
  initialHasMore,
}: {
  initialFans: PublicFanCard[];
  initialHasMore: boolean;
}) {
  const [searchInput, setSearchInput] = useState("");
  const [activeSearch, setActiveSearch] = useState("");
  const [fans, setFans] = useState<PublicFanCard[]>(initialFans);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loadingMore, setLoadingMore] = useState(false);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Same requestId + AbortController guard as MusicList.tsx: prevents a
  // slow "load more" response from landing after a newer search has
  // already replaced the list (which would otherwise mix two different
  // search results together, or re-append already-shown members).
  const requestIdRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  const fetchPage = useCallback(async (params: URLSearchParams, mode: "replace" | "append") => {
    const myRequestId = ++requestIdRef.current;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    if (mode === "append") {
      setLoadingMore(true);
    } else {
      setSearching(true);
    }
    setError(null);

    try {
      const response = await fetch(`/api/fans?${params.toString()}`, { signal: controller.signal });

      if (myRequestId !== requestIdRef.current) {
        return; // A newer request has since started; discard this result.
      }

      if (!response.ok) {
        console.error("fans list: request failed", response.status);
        setError("会員一覧の取得に失敗しました。");
        return;
      }

      const body = (await response.json()) as { fans: PublicFanCard[]; has_more: boolean };
      setFans((previous) => (mode === "append" ? [...previous, ...body.fans] : body.fans));
      setHasMore(Boolean(body.has_more));
    } catch (fetchError) {
      if ((fetchError as { name?: string }).name === "AbortError") {
        return; // Superseded by a newer request — not a real failure.
      }
      if (myRequestId !== requestIdRef.current) {
        return;
      }
      console.error("fans list: fetch threw", fetchError);
      setError("会員一覧の取得に失敗しました。");
    } finally {
      if (myRequestId === requestIdRef.current) {
        setLoadingMore(false);
        setSearching(false);
      }
    }
  }, []);

  function handleSearchSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = searchInput.trim();
    setActiveSearch(trimmed);
    // Cursor reset: a new search always starts a fresh first page — never
    // carries over after_username/after_id from the previous search, so
    // results from different search terms never mix.
    const params = new URLSearchParams();
    if (trimmed) {
      params.set("search", trimmed);
    }
    void fetchPage(params, "replace");
  }

  const loadMore = useCallback(() => {
    const last = fans[fans.length - 1];
    if (!last) {
      return;
    }
    const params = new URLSearchParams();
    if (activeSearch) {
      params.set("search", activeSearch);
    }
    params.set("after_username", last.username);
    params.set("after_id", last.id);
    void fetchPage(params, "append");
  }, [fans, activeSearch, fetchPage]);

  return (
    <div className="mt-6">
      <form onSubmit={handleSearchSubmit} className="flex gap-2">
        <label htmlFor="fans-search" className="sr-only">
          ユーザー名・表示名で検索
        </label>
        <input
          id="fans-search"
          type="search"
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
          placeholder="ユーザー名・表示名で検索"
          className="w-full rounded-xl border border-border bg-background px-4 py-3 text-base text-foreground placeholder:text-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        />
        <button type="submit" disabled={searching} className={buttonClassName("secondary", "shrink-0")}>
          検索
        </button>
      </form>

      {error ? (
        <div role="alert" aria-live="polite" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
          <p>{error}</p>
          <button
            type="button"
            onClick={() => {
              const params = new URLSearchParams();
              if (activeSearch) {
                params.set("search", activeSearch);
              }
              void fetchPage(params, "replace");
            }}
            className={buttonClassName("secondary", "mt-2")}
          >
            再試行
          </button>
        </div>
      ) : null}

      {!error && fans.length === 0 ? (
        <div className="mt-6 flex flex-col items-center gap-3 rounded-2xl border border-border bg-surface px-6 py-12 text-center">
          <AvatarInitial label="?" size="md" />
          <p className="text-muted">
            {activeSearch ? "一致するファンが見つかりませんでした。" : "ファンはまだ登録されていません。"}
          </p>
        </div>
      ) : null}

      {fans.length > 0 ? (
        <ul className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {fans.map((fan) => {
            const fanSinceText = formatFanSince(fan.fan_since);
            return (
              <li key={fan.id}>
                <Link
                  href={`/fans/${fan.username}`}
                  className="block rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                >
                  <Card className="flex items-center gap-3 p-4 transition-shadow hover:shadow-md">
                    <AvatarInitial label={fan.display_name} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-bold">{fan.display_name}</p>
                      <p className="truncate text-sm text-muted">@{fan.username}</p>
                      {fanSinceText ? <p className="mt-1 text-xs text-muted">{fanSinceText}</p> : null}
                    </div>
                  </Card>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : null}

      {hasMore ? (
        <div className="mt-6 flex justify-center">
          <button type="button" onClick={loadMore} disabled={loadingMore} className={buttonClassName("secondary")}>
            {loadingMore ? "読み込み中..." : "さらに読み込む"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
