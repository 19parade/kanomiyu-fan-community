"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { Card } from "@/components/ui/Card";
import { buttonClassName } from "@/components/ui/Button";

const INPUT_CLASS =
  "mt-1 w-full rounded-xl border border-border bg-background px-4 py-3 text-base text-foreground placeholder:text-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-50";

function statusBadgeClass(status: string): string {
  if (status === "public") return "bg-brand/15 text-brand";
  if (status === "cancelled") return "bg-rose-100 text-rose-700";
  return "bg-foreground/5 text-muted";
}

export type AdminEventRow = {
  id: string;
  title: string;
  venue: string;
  event_date: string;
  status: string;
  first_published_at: string | null;
  updated_at: string;
};

type StatusFilterValue = "all" | "draft" | "public" | "cancelled";

const SEARCH_DEBOUNCE_MS = 300;
const SEARCH_MAX_LENGTH = 100; // UX hint only; the DB's own 100-char check is authoritative.

function formatDateTime(value: string): string {
  try {
    return new Intl.DateTimeFormat("ja-JP", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Asia/Tokyo",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function statusLabel(status: string): string {
  if (status === "draft") return "下書き";
  if (status === "public") return "公開中";
  if (status === "cancelled") return "中止";
  return status;
}

/**
 * Read-only admin event list (LIVE機能 Phase 1), mirroring
 * components/admin/music/MusicAdminList.tsx's structure exactly (same
 * debounced search / status filter / keyset "load more" / abort-stale-
 * request pattern). Never calls Supabase directly from the browser — every
 * subsequent read goes through GET /api/admin/events, which re-verifies
 * active-admin authorization itself.
 */
export function EventsAdminList({
  initialEvents,
  initialHasMore,
}: {
  initialEvents: AdminEventRow[];
  initialHasMore: boolean;
}) {
  const [events, setEvents] = useState<AdminEventRow[]>(initialEvents);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [searchInput, setSearchInput] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilterValue>("all");
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const requestIdRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const didMountRef = useRef(false);

  const runFetch = useCallback(
    async (options: {
      search: string;
      status: StatusFilterValue;
      cursor?: { eventDate: string; id: string };
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
        params.set("after_event_date", options.cursor.eventDate);
      }

      try {
        const response = await fetch(`/api/admin/events?${params.toString()}`, {
          signal: controller.signal,
        });

        if (myRequestId !== requestIdRef.current) {
          return;
        }

        if (!response.ok) {
          console.error("events admin list: request failed", response.status);
          setError("LIVE一覧の取得に失敗しました。");
          return;
        }

        const body = (await response.json()) as { events: AdminEventRow[]; has_more: boolean };
        setEvents((previous) => (options.append ? [...previous, ...body.events] : body.events));
        setHasMore(Boolean(body.has_more));
      } catch (fetchError) {
        if ((fetchError as { name?: string }).name === "AbortError") {
          return;
        }
        if (myRequestId !== requestIdRef.current) {
          return;
        }
        console.error("events admin list: fetch threw", fetchError);
        setError("LIVE一覧の取得に失敗しました。");
      } finally {
        if (myRequestId === requestIdRef.current) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    []
  );

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
    const last = events[events.length - 1];
    if (!last) {
      return;
    }
    void runFetch({
      search: searchInput,
      status: statusFilter,
      append: true,
      cursor: { eventDate: last.event_date, id: last.id },
    });
  }

  function handleRetry() {
    void runFetch({ search: searchInput, status: statusFilter, append: false });
  }

  const isFilterActive = searchInput !== "" || statusFilter !== "all";

  return (
    <div className="mt-6">
      <div className="flex flex-wrap gap-4">
        <div className="min-w-0 flex-1">
          <label htmlFor="events-admin-search" className="block text-sm font-bold">
            LIVE名称・会場で検索
          </label>
          <input
            id="events-admin-search"
            name="search"
            type="text"
            maxLength={SEARCH_MAX_LENGTH}
            value={searchInput}
            disabled={loading}
            onChange={(event) => setSearchInput(event.target.value)}
            className={INPUT_CLASS}
          />
        </div>
        <div>
          <label htmlFor="events-admin-status" className="block text-sm font-bold">
            公開状態
          </label>
          <select
            id="events-admin-status"
            name="status"
            value={statusFilter}
            disabled={loading}
            onChange={(event) => setStatusFilter(event.target.value as StatusFilterValue)}
            className={INPUT_CLASS}
          >
            <option value="all">すべて</option>
            <option value="draft">下書き</option>
            <option value="public">公開中</option>
            <option value="cancelled">中止</option>
          </select>
        </div>
      </div>

      {loading ? (
        <p aria-live="polite" className="mt-4 text-sm text-muted">
          読み込み中...
        </p>
      ) : null}

      {error ? (
        <div role="alert" aria-live="polite" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
          <p>{error}</p>
          <button type="button" onClick={handleRetry} disabled={loading} className={buttonClassName("secondary", "mt-2")}>
            再試行
          </button>
        </div>
      ) : null}

      {!loading && !error && events.length === 0 ? (
        <p className="mt-4 text-sm text-muted">
          {isFilterActive ? "条件に一致するLIVEはありません。" : "LIVEはまだ登録されていません。"}
        </p>
      ) : null}

      {events.length > 0 ? (
        <Card className="mt-4 overflow-x-auto p-0">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted">
                <th scope="col" className="px-4 py-3 font-bold">タイトル</th>
                <th scope="col" className="px-4 py-3 font-bold">会場</th>
                <th scope="col" className="px-4 py-3 font-bold">開催日時</th>
                <th scope="col" className="px-4 py-3 font-bold">ステータス</th>
                <th scope="col" className="px-4 py-3 font-bold">更新日時</th>
                <th scope="col" className="px-4 py-3 font-bold">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {events.map((event) => (
                <tr key={event.id}>
                  <td className="px-4 py-3">{event.title}</td>
                  <td className="px-4 py-3">{event.venue}</td>
                  <td className="px-4 py-3">{formatDateTime(event.event_date)}</td>
                  <td className="px-4 py-3">
                    <span className={["inline-block rounded-full px-2 py-0.5 text-xs font-bold", statusBadgeClass(event.status)].join(" ")}>
                      {statusLabel(event.status)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted">{formatDateTime(event.updated_at)}</td>
                  <td className="px-4 py-3">
                    <Link href={`/admin/events/${event.id}`} className="font-bold text-brand underline-offset-2 hover:underline">
                      編集
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ) : null}

      {hasMore ? (
        <button
          type="button"
          onClick={handleLoadMore}
          disabled={loading || loadingMore}
          className={buttonClassName("secondary", "mt-4 w-full sm:w-auto")}
        >
          {loadingMore ? "読み込み中..." : "さらに読み込む"}
        </button>
      ) : null}
    </div>
  );
}
