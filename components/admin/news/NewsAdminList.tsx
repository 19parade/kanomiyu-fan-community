"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { Card } from "@/components/ui/Card";
import { buttonClassName } from "@/components/ui/Button";
import { formatNewsDate } from "@/lib/news/format";

const INPUT_CLASS =
  "mt-1 w-full rounded-xl border border-border bg-background px-4 py-3 text-base text-foreground placeholder:text-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-50";

export type AdminNewsRow = {
  id: string;
  title: string;
  published_at: string;
  status: string;
  has_content: boolean;
  has_link: boolean;
  updated_at: string;
};

type StatusFilterValue = "all" | "draft" | "published";

function statusBadgeClass(status: string): string {
  return status === "published" ? "bg-brand/15 text-brand" : "bg-foreground/5 text-muted";
}

function statusLabel(status: string): string {
  return status === "published" ? "公開" : "非公開";
}

/**
 * Read-only(+削除) admin news list (WHAT'S NEW機能), mirroring
 * components/admin/events/EventsAdminList.tsx's structure (status filter /
 * keyset "load more" / abort-stale-request pattern), minus the title/venue
 * search box — the PM spec for news did not ask for search, so this list
 * keeps only what was requested (status filter + newest-first order) rather
 * than copying every EventsAdminList feature unconditionally.
 *
 * Adds an inline削除 action with a window.confirm() guard (same pattern as
 * EditEventForm.tsx's status-change confirmations) since news is the first
 * admin resource in this codebase with an actual physical DELETE RPC.
 */
export function NewsAdminList({
  initialNews,
  initialHasMore,
}: {
  initialNews: AdminNewsRow[];
  initialHasMore: boolean;
}) {
  const [news, setNews] = useState<AdminNewsRow[]>(initialNews);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [statusFilter, setStatusFilter] = useState<StatusFilterValue>("all");
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const requestIdRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const didMountRef = useRef(false);

  const runFetch = useCallback(
    async (options: {
      status: StatusFilterValue;
      cursor?: { publishedAt: string; id: string };
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
      if (options.status !== "all") {
        params.set("status", options.status);
      }
      if (options.cursor) {
        params.set("after_id", options.cursor.id);
        params.set("after_published_at", options.cursor.publishedAt);
      }

      try {
        const response = await fetch(`/api/admin/news?${params.toString()}`, {
          signal: controller.signal,
        });

        if (myRequestId !== requestIdRef.current) {
          return;
        }

        if (!response.ok) {
          console.error("news admin list: request failed", response.status);
          setError("お知らせ一覧の取得に失敗しました。");
          return;
        }

        const body = (await response.json()) as { news: AdminNewsRow[]; has_more: boolean };
        setNews((previous) => (options.append ? [...previous, ...body.news] : body.news));
        setHasMore(Boolean(body.has_more));
      } catch (fetchError) {
        if ((fetchError as { name?: string }).name === "AbortError") {
          return;
        }
        if (myRequestId !== requestIdRef.current) {
          return;
        }
        console.error("news admin list: fetch threw", fetchError);
        setError("お知らせ一覧の取得に失敗しました。");
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
    void runFetch({ status: statusFilter, append: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  function handleLoadMore() {
    const last = news[news.length - 1];
    if (!last) {
      return;
    }
    void runFetch({
      status: statusFilter,
      append: true,
      cursor: { publishedAt: last.published_at, id: last.id },
    });
  }

  function handleRetry() {
    void runFetch({ status: statusFilter, append: false });
  }

  async function handleDelete(row: AdminNewsRow) {
    if (!window.confirm(`「${row.title}」を削除しますか？この操作は取り消せません。`)) {
      return;
    }

    setDeletingId(row.id);
    setError(null);

    try {
      const response = await fetch(`/api/admin/news/${row.id}`, { method: "DELETE" });
      if (!response.ok) {
        console.error("news admin list: delete failed", response.status);
        setError("削除できませんでした。");
        return;
      }
      setNews((previous) => previous.filter((item) => item.id !== row.id));
    } catch (deleteError) {
      console.error("news admin list: delete threw", deleteError);
      setError("削除できませんでした。");
    } finally {
      setDeletingId(null);
    }
  }

  const isFilterActive = statusFilter !== "all";

  return (
    <div className="mt-6">
      <div className="flex flex-wrap gap-4">
        <div>
          <label htmlFor="news-admin-status" className="block text-sm font-bold">
            公開状態
          </label>
          <select
            id="news-admin-status"
            name="status"
            value={statusFilter}
            disabled={loading}
            onChange={(event) => setStatusFilter(event.target.value as StatusFilterValue)}
            className={INPUT_CLASS}
          >
            <option value="all">すべて</option>
            <option value="draft">非公開</option>
            <option value="published">公開</option>
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

      {!loading && !error && news.length === 0 ? (
        <p className="mt-4 text-sm text-muted">
          {isFilterActive ? "条件に一致するお知らせはありません。" : "お知らせはまだ登録されていません。"}
        </p>
      ) : null}

      {news.length > 0 ? (
        <Card className="mt-4 overflow-x-auto p-0">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted">
                <th scope="col" className="px-4 py-3 font-bold">日付</th>
                <th scope="col" className="px-4 py-3 font-bold">タイトル</th>
                <th scope="col" className="px-4 py-3 font-bold">本文</th>
                <th scope="col" className="px-4 py-3 font-bold">リンク</th>
                <th scope="col" className="px-4 py-3 font-bold">ステータス</th>
                <th scope="col" className="px-4 py-3 font-bold">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {news.map((item) => (
                <tr key={item.id}>
                  <td className="px-4 py-3 whitespace-nowrap">{formatNewsDate(item.published_at)}</td>
                  <td className="max-w-xs px-4 py-3 break-words">{item.title}</td>
                  <td className="px-4 py-3 text-muted">{item.has_content ? "あり" : "なし"}</td>
                  <td className="px-4 py-3 text-muted">{item.has_link ? "あり" : "なし"}</td>
                  <td className="px-4 py-3">
                    <span className={["inline-block rounded-full px-2 py-0.5 text-xs font-bold", statusBadgeClass(item.status)].join(" ")}>
                      {statusLabel(item.status)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-3">
                      <Link href={`/admin/news/${item.id}`} className="font-bold text-brand underline-offset-2 hover:underline">
                        編集
                      </Link>
                      <button
                        type="button"
                        onClick={() => handleDelete(item)}
                        disabled={deletingId === item.id}
                        className="font-bold text-rose-600 underline-offset-2 hover:underline disabled:opacity-50"
                      >
                        {deletingId === item.id ? "削除中..." : "削除"}
                      </button>
                    </div>
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
