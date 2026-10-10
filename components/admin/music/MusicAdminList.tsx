"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

export type AdminSongRow = {
  id: string;
  title: string;
  release_date: string | null;
  status: string;
  updated_at: string;
};

type StatusFilterValue = "all" | "draft" | "public";

const SEARCH_DEBOUNCE_MS = 300;
const SEARCH_MAX_LENGTH = 100; // UX hint only; the DB's own 100-char check is authoritative.

function formatUpdatedAt(value: string): string {
  try {
    return new Intl.DateTimeFormat("ja-JP", { dateStyle: "medium", timeStyle: "short" }).format(
      new Date(value)
    );
  } catch {
    // Never let a formatting quirk crash the row — fall back to the raw value.
    return value;
  }
}

function statusLabel(status: string): string {
  if (status === "draft") return "下書き";
  if (status === "public") return "公開";
  // Defensive: the DB CHECK constraint currently only allows draft/public,
  // but this must never crash the screen if that ever changes.
  return status;
}

/**
 * Read-only admin song list (A2). Receives the Server Component's initial
 * page as props so the first render needs no client-side fetch; search,
 * status filter, and "load more" are handled here against
 * `GET /api/admin/music` (see app/api/admin/music/route.ts).
 *
 * Never calls Supabase directly from the browser (A2 §18/§88) — every
 * subsequent read goes through the app's own Route Handler, which
 * re-verifies active-admin authorization itself regardless of this UI.
 */
export function MusicAdminList({
  initialSongs,
  initialHasMore,
}: {
  initialSongs: AdminSongRow[];
  initialHasMore: boolean;
}) {
  const [songs, setSongs] = useState<AdminSongRow[]>(initialSongs);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [searchInput, setSearchInput] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilterValue>("all");
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Guards against out-of-order responses (A2 §29/§79): only the response
  // matching the latest requestId is ever applied to state. Combined with
  // AbortController so a superseded in-flight request is also cancelled,
  // not just ignored.
  const requestIdRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const didMountRef = useRef(false);

  const runFetch = useCallback(
    async (options: {
      search: string;
      status: StatusFilterValue;
      cursor?: { releaseDate: string | null; id: string };
      append: boolean;
    }) => {
      const myRequestId = ++requestIdRef.current;
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      if (options.append) {
        setLoadingMore(true);
      } else {
        setLoading(true);
      }
      setError(null);

      const params = new URLSearchParams();
      if (options.search !== "") {
        params.set("search", options.search);
      }
      if (options.status !== "all") {
        params.set("status", options.status);
      }
      if (options.cursor) {
        params.set("after_id", options.cursor.id);
        if (options.cursor.releaseDate !== null) {
          params.set("after_release_date", options.cursor.releaseDate);
        }
      }

      try {
        const response = await fetch(`/api/admin/music?${params.toString()}`, {
          signal: controller.signal,
        });

        if (myRequestId !== requestIdRef.current) {
          return; // A newer request has since started; discard this result.
        }

        if (!response.ok) {
          console.error("music admin list: request failed", response.status);
          setError("楽曲一覧の取得に失敗しました。");
          return;
        }

        const body = (await response.json()) as { songs: AdminSongRow[]; has_more: boolean };
        setSongs((previous) => (options.append ? [...previous, ...body.songs] : body.songs));
        setHasMore(Boolean(body.has_more));
      } catch (fetchError) {
        if ((fetchError as { name?: string }).name === "AbortError") {
          return; // Superseded by a newer request — not a real failure.
        }
        if (myRequestId !== requestIdRef.current) {
          return;
        }
        console.error("music admin list: fetch threw", fetchError);
        setError("楽曲一覧の取得に失敗しました。");
      } finally {
        if (myRequestId === requestIdRef.current) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    []
  );

  // Debounced reset-fetch whenever search text or the status filter
  // changes. Skips the very first render so the server-provided initial
  // page is used as-is (A2 §16) instead of being immediately re-fetched.
  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true;
      return;
    }
    const handle = setTimeout(() => {
      void runFetch({ search: searchInput, status: statusFilter, append: false });
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput, statusFilter]);

  function handleLoadMore() {
    const last = songs[songs.length - 1];
    if (!last) {
      return;
    }
    void runFetch({
      search: searchInput,
      status: statusFilter,
      append: true,
      cursor: { releaseDate: last.release_date, id: last.id },
    });
  }

  function handleRetry() {
    void runFetch({ search: searchInput, status: statusFilter, append: false });
  }

  const isFilterActive = searchInput !== "" || statusFilter !== "all";

  return (
    <div>
      <div>
        <div>
          <label htmlFor="music-admin-search">楽曲タイトルを検索</label>
          <br />
          <input
            id="music-admin-search"
            name="search"
            type="text"
            maxLength={SEARCH_MAX_LENGTH}
            value={searchInput}
            disabled={loading}
            onChange={(event) => setSearchInput(event.target.value)}
          />
        </div>
        <div>
          <label htmlFor="music-admin-status">公開状態</label>
          <br />
          <select
            id="music-admin-status"
            name="status"
            value={statusFilter}
            disabled={loading}
            onChange={(event) => setStatusFilter(event.target.value as StatusFilterValue)}
          >
            <option value="all">すべて</option>
            <option value="draft">下書き</option>
            <option value="public">公開</option>
          </select>
        </div>
      </div>

      {loading ? <p aria-live="polite">読み込み中...</p> : null}

      {error ? (
        <div role="alert" aria-live="polite">
          <p>{error}</p>
          <button type="button" onClick={handleRetry} disabled={loading}>
            再試行
          </button>
        </div>
      ) : null}

      {!loading && !error && songs.length === 0 ? (
        <p>{isFilterActive ? "条件に一致する楽曲はありません。" : "楽曲はまだ登録されていません。"}</p>
      ) : null}

      {songs.length > 0 ? (
        <div style={{ overflowX: "auto" }}>
          <table>
            <thead>
              <tr>
                <th scope="col">タイトル</th>
                <th scope="col">発売日</th>
                <th scope="col">ステータス</th>
                <th scope="col">更新日時</th>
                <th scope="col">操作</th>
              </tr>
            </thead>
            <tbody>
              {songs.map((song) => (
                <tr key={song.id}>
                  <td>{song.title}</td>
                  <td>{song.release_date ?? "未設定"}</td>
                  <td>{statusLabel(song.status)}</td>
                  <td>{formatUpdatedAt(song.updated_at)}</td>
                  <td>
                    <Link href={`/admin/music/${song.id}`}>編集</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {hasMore ? (
        <button type="button" onClick={handleLoadMore} disabled={loading || loadingMore}>
          {loadingMore ? "読み込み中..." : "さらに読み込む"}
        </button>
      ) : null}
    </div>
  );
}
