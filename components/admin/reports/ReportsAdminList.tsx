"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import type { AdminReportItem } from "@/lib/admin/reports/list";
import {
  REPORT_ALLOWED_NEXT_STATUSES,
  REPORT_STATUS_FILTER_OPTIONS,
  REPORT_STATUS_LABELS,
  REPORT_TARGET_TYPE_LABELS,
  type ReportStatus,
} from "@/lib/admin/reports/status";
import { REPORT_REASONS } from "@/lib/reports/reasons";

type StatusFilterValue = ReportStatus | "all";

function reasonLabel(reason: string): string {
  return REPORT_REASONS.find((r) => r.value === reason)?.label ?? reason;
}

function formatTimestamp(value: string | null): string {
  if (!value) return "—";
  try {
    return new Intl.DateTimeFormat("ja-JP", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
  } catch {
    return value;
  }
}

const PROCESS_ERROR_MESSAGES: Record<string, string> = {
  REPORT_PROCESSING_NOT_AUTHORIZED: "この操作を行う権限がありません。",
  INVALID_REPORT_STATUS: "指定した状態が正しくありません。",
  REPORT_PROCESSING_NOTE_TOO_LONG: "メモは1000文字以内で入力してください。",
  REPORT_NOT_AVAILABLE: "対象の通報が見つかりませんでした。一覧を更新してください。",
  INVALID_REPORT_TRANSITION: "この通報は既に別の状態に変更されています。一覧を更新してください。",
};

function processErrorMessage(code: string | undefined | null): string {
  if (!code) return "処理に失敗しました。しばらくしてから再度お試しください。";
  return PROCESS_ERROR_MESSAGES[code] ?? "処理に失敗しました。しばらくしてから再度お試しください。";
}

const MODERATION_ERROR_MESSAGES: Record<string, string> = {
  MODERATION_NOT_AUTHORIZED: "この操作を行う権限がありません。",
  INVALID_MODERATION_TRANSITION: "対象の状態が変更されているため、この操作はできません。一覧を更新してください。",
  MODERATION_REASON_TOO_LONG: "理由は500文字以内で入力してください。",
  MODERATION_TARGET_NOT_AVAILABLE: "対象の投稿・コメントが見つかりませんでした。",
};

function moderationErrorMessage(code: string | undefined | null): string {
  if (!code) return "操作に失敗しました。しばらくしてから再度お試しください。";
  return MODERATION_ERROR_MESSAGES[code] ?? "操作に失敗しました。しばらくしてから再度お試しください。";
}

/**
 * F5-D4c: moderates the report's *target* (the post/comment itself) via
 * moderate_post()/moderate_comment() — a deliberately separate control from
 * the report-processing form above it. Visually and functionally
 * independent: this never changes `reports.status`, and the report form
 * above never changes the target's status (PROJECT_SPEC.md「対象の
 * moderationとの分離」/ F5-D4c §5's explicit requirement). `deleted` is
 * never offered here — moderate_post()/moderate_comment() reject it
 * (INVALID_MODERATION_TRANSITION) and are terminal/self-delete-only for
 * that status, so no "復元" control exists for a deleted target at all.
 */
function TargetModerationControl({
  targetType,
  targetId,
  targetStatus,
  onModerated,
}: {
  targetType: "post" | "comment";
  targetId: string;
  targetStatus: string;
  onModerated: (newStatus: string) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submittingRef = useRef(false);

  if (targetStatus !== "published" && targetStatus !== "hidden") {
    // deleted (or any other non-moderatable state): no control at all.
    return null;
  }

  const nextStatus = targetStatus === "published" ? "hidden" : "published";
  const actionLabel = targetStatus === "published" ? "対象を非表示にする" : "対象を復元する";
  const confirmText =
    targetStatus === "published"
      ? "この投稿・コメントを非表示にしますか？ 会員からは見えなくなります（通報の対応状況は変わりません）。"
      : "この投稿・コメントを元に戻しますか？ 再び会員に表示されます（通報の対応状況は変わりません）。";

  async function handleModerate() {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setPending(true);
    setError(null);

    try {
      const path = targetType === "post" ? `/api/admin/posts/${targetId}/moderate` : `/api/admin/comments/${targetId}/moderate`;
      const response = await fetch(path, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ new_status: nextStatus }),
      });

      if (!response.ok) {
        let code: string | undefined;
        try {
          const body = (await response.json()) as { error?: string };
          code = body.error;
        } catch {
          // ignore parse failure
        }
        console.error("target moderation: request failed", response.status, code);
        setError(moderationErrorMessage(code));
        setPending(false);
        submittingRef.current = false;
        return;
      }

      onModerated(nextStatus);
      setConfirming(false);
      setPending(false);
      submittingRef.current = false;
    } catch (fetchError) {
      console.error("target moderation: request threw", fetchError);
      setError("通信エラーが発生しました。ネットワーク環境をご確認のうえ、再度お試しください。");
      setPending(false);
      submittingRef.current = false;
    }
  }

  return (
    <div>
      {!confirming ? (
        <button type="button" onClick={() => setConfirming(true)}>
          {actionLabel}
        </button>
      ) : (
        <div>
          <p>{confirmText}</p>
          {error ? (
            <p role="alert" aria-live="polite">
              {error}
            </p>
          ) : null}
          <button type="button" onClick={() => void handleModerate()} disabled={pending}>
            {pending ? "処理中..." : "実行する"}
          </button>
          <button
            type="button"
            onClick={() => {
              submittingRef.current = false;
              setError(null);
              setConfirming(false);
            }}
            disabled={pending}
          >
            キャンセル
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * F5-D4b: one report row — target preview, metadata, and (when the current
 * status allows it) an inline "対応する" form. Never implies the target
 * post/comment itself was hidden/changed by processing a report —
 * process_report() only ever changes `reports.status`
 * (supabase/migrations/20260927150000_process_report_rpc.sql's own doc
 * comment / PROJECT_SPEC.md「対象のmoderationとの分離」) — so every label
 * here describes the *report's* state, never the target's.
 */
function ReportRow({
  report,
  onProcessed,
  onTargetModerated,
}: {
  report: AdminReportItem;
  onProcessed: (updated: AdminReportItem) => void;
  onTargetModerated: (reportId: string, newTargetStatus: string) => void;
}) {
  const [mode, setMode] = useState<"view" | "form">("view");
  const [nextStatus, setNextStatus] = useState<ReportStatus | "">("");
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Same synchronous-guard reasoning as components/feed/CommentForm.tsx /
  // components/feed/LikeButton.tsx / components/feed/ReportButton.tsx:
  // `pending` state alone cannot prevent several rapid submits in the same
  // tick.
  const submittingRef = useRef(false);

  const allowedNext = REPORT_ALLOWED_NEXT_STATUSES[report.status as ReportStatus] ?? [];
  const targetLabel = REPORT_TARGET_TYPE_LABELS[report.target_type] ?? report.target_type;

  async function handleProcess() {
    if (submittingRef.current) {
      return;
    }
    if (!nextStatus) {
      setError("変更後の状態を選択してください。");
      return;
    }
    submittingRef.current = true;
    setPending(true);
    setError(null);

    try {
      const response = await fetch(`/api/admin/reports/${report.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ new_status: nextStatus, note: note.trim() || undefined }),
      });

      if (!response.ok) {
        let code: string | undefined;
        try {
          const body = (await response.json()) as { error?: string };
          code = body.error;
        } catch {
          // ignore parse failure, fall back to generic message
        }
        console.error("report row: process failed", response.status, code);
        setError(processErrorMessage(code));
        setPending(false);
        submittingRef.current = false;
        return;
      }

      const body = (await response.json()) as { report: Partial<AdminReportItem> };
      onProcessed({ ...report, ...body.report } as AdminReportItem);
      setMode("view");
      setNote("");
      setNextStatus("");
      setPending(false);
      submittingRef.current = false;
    } catch (fetchError) {
      console.error("report row: request threw", fetchError);
      setError("通信エラーが発生しました。ネットワーク環境をご確認のうえ、再度お試しください。");
      setPending(false);
      submittingRef.current = false;
    }
  }

  // F5-D4c: /feed/[id] only ever renders a `status = 'published'` post
  // (app/feed/[id]/page.tsx's own fetchPostDetail()), so a link there 404s
  // for a hidden/deleted post, or for a comment whose parent post is itself
  // hidden/deleted — never offer that link as if it were a working
  // "確認する" path in those cases (F5-D4c §2's explicit requirement). The
  // content snippet already shown above is the only confirmation path for
  // a non-published target; this is additive, not a replacement for it.
  const canLinkToTarget =
    report.target !== null &&
    (report.target_type === "post"
      ? report.target.status === "published"
      : report.target_type === "comment"
        ? report.target.status === "published" && report.target.parent_post_status === "published"
        : false);

  return (
    <tr>
      <td>
        {targetLabel}
        {report.target ? (
          <>
            <br />
            <span>{report.target.content.slice(0, 80)}</span>
            {report.target.status !== "published" ? <> （{report.target.status}）</> : null}
            <br />
            {canLinkToTarget ? (
              report.target_type === "post" ? (
                <Link href={`/feed/${report.target_id}`}>対象を確認</Link>
              ) : (
                <Link href={`/feed/${report.target.post_id}`}>対象の投稿を確認</Link>
              )
            ) : (
              <span>非公開のため直接確認はできません（上記の内容をご覧ください）</span>
            )}
            <br />
            <strong>対象の公開状態の操作</strong>
            <br />
            <TargetModerationControl
              targetType={report.target_type as "post" | "comment"}
              targetId={report.target_id}
              targetStatus={report.target.status}
              onModerated={(newStatus) => onTargetModerated(report.id, newStatus)}
            />
          </>
        ) : (
          <>
            <br />
            <span>対象が見つかりません（削除済みの可能性があります）</span>
          </>
        )}
      </td>
      <td>{reasonLabel(report.reason)}</td>
      <td>{report.detail ?? "—"}</td>
      <td>
        【{REPORT_STATUS_LABELS[report.status as ReportStatus] ?? report.status}】
      </td>
      <td>{formatTimestamp(report.created_at)}</td>
      <td>{formatTimestamp(report.handled_at)}</td>
      <td>{report.handled_by_display_name ?? (report.handled_by ? "（表示できません）" : "—")}</td>
      <td>
        {allowedNext.length === 0 ? (
          <span>対応済み</span>
        ) : mode === "view" ? (
          <button type="button" onClick={() => setMode("form")}>
            対応する
          </button>
        ) : (
          <div>
            <label>
              変更後の状態
              <select
                value={nextStatus}
                disabled={pending}
                onChange={(event) => setNextStatus(event.target.value as ReportStatus)}
              >
                <option value="">選択してください</option>
                {allowedNext.map((status) => (
                  <option key={status} value={status}>
                    {REPORT_STATUS_LABELS[status]}
                  </option>
                ))}
              </select>
            </label>
            <br />
            <label>
              メモ（任意）
              <br />
              <textarea
                rows={2}
                disabled={pending}
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="対応内容の記録（会員には公開されません）"
              />
            </label>
            {error ? (
              <p role="alert" aria-live="polite">
                {error}
              </p>
            ) : null}
            {nextStatus ? (
              <p>
                この通報を「{REPORT_STATUS_LABELS[nextStatus]}」に変更します。対象の投稿・コメントの表示状態は変わりません。よろしいですか？
              </p>
            ) : null}
            <button type="button" onClick={() => void handleProcess()} disabled={pending || !nextStatus}>
              {pending ? "処理中..." : "この内容で確定する"}
            </button>
            <button
              type="button"
              onClick={() => {
                submittingRef.current = false;
                setError(null);
                setNote("");
                setNextStatus("");
                setMode("view");
              }}
              disabled={pending}
            >
              キャンセル
            </button>
          </div>
        )}
      </td>
    </tr>
  );
}

/**
 * F5-D4b: admin report list — status filter + keyset "load more" against
 * GET /api/admin/reports, same requestId/AbortController guard architecture
 * as components/admin/music/MusicAdminList.tsx. Never calls Supabase
 * directly from the browser (same rule that component documents) — every
 * read/write goes through this app's own Route Handlers, which re-verify
 * active-admin authorization themselves regardless of this UI or
 * app/admin/layout.tsx's guard.
 */
export function ReportsAdminList({
  initialReports,
  initialHasMore,
}: {
  initialReports: AdminReportItem[];
  initialHasMore: boolean;
}) {
  const [reports, setReports] = useState<AdminReportItem[]>(initialReports);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [statusFilter, setStatusFilter] = useState<StatusFilterValue>("all");
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const requestIdRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const didMountRef = useRef(false);

  const runFetch = useCallback(
    async (options: { status: StatusFilterValue; cursor?: { createdAt: string; id: string }; append: boolean }) => {
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
        params.set("after_created_at", options.cursor.createdAt);
        params.set("after_id", options.cursor.id);
      }

      try {
        const response = await fetch(`/api/admin/reports?${params.toString()}`, { signal: controller.signal });

        if (myRequestId !== requestIdRef.current) {
          return;
        }

        if (!response.ok) {
          console.error("reports admin list: request failed", response.status);
          setError("通報一覧の取得に失敗しました。");
          return;
        }

        const body = (await response.json()) as { reports: AdminReportItem[]; has_more: boolean };
        setReports((previous) => (options.append ? [...previous, ...body.reports] : body.reports));
        setHasMore(Boolean(body.has_more));
      } catch (fetchError) {
        if ((fetchError as { name?: string }).name === "AbortError") {
          return;
        }
        if (myRequestId !== requestIdRef.current) {
          return;
        }
        console.error("reports admin list: fetch threw", fetchError);
        setError("通報一覧の取得に失敗しました。");
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
    const last = reports[reports.length - 1];
    if (!last) return;
    void runFetch({ status: statusFilter, append: true, cursor: { createdAt: last.created_at, id: last.id } });
  }

  function handleRetry() {
    void runFetch({ status: statusFilter, append: false });
  }

  function handleProcessed(updated: AdminReportItem) {
    setReports((previous) => previous.map((r) => (r.id === updated.id ? updated : r)));
  }

  // F5-D4c: moderating a target updates every report row referencing that
  // same target_id (a post/comment can have more than one report), not
  // just the row the admin clicked from — otherwise a second row for the
  // same target would keep showing a stale status until the next list
  // reload. Only `target.status` changes here; `reports.status` on any of
  // these rows is untouched (handled entirely by handleProcessed above).
  function handleTargetModerated(reportId: string, newTargetStatus: string) {
    setReports((previous) => {
      const sourceReport = previous.find((r) => r.id === reportId);
      const targetId = sourceReport?.target_id;
      return previous.map((r) =>
        r.target_id === targetId && r.target !== null
          ? { ...r, target: { ...r.target, status: newTargetStatus } }
          : r
      );
    });
  }

  return (
    <div>
      <div>
        <label htmlFor="reports-status-filter">状態で絞り込み</label>
        <br />
        <select
          id="reports-status-filter"
          value={statusFilter}
          disabled={loading}
          onChange={(event) => setStatusFilter(event.target.value as StatusFilterValue)}
        >
          {REPORT_STATUS_FILTER_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
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

      {!loading && !error && reports.length === 0 ? (
        <p>{statusFilter !== "all" ? "この状態の通報はありません。" : "通報はまだありません。"}</p>
      ) : null}

      {reports.length > 0 ? (
        <div style={{ overflowX: "auto" }}>
          <table>
            <thead>
              <tr>
                <th scope="col">対象</th>
                <th scope="col">理由</th>
                <th scope="col">詳細</th>
                <th scope="col">状態</th>
                <th scope="col">通報日時</th>
                <th scope="col">対応日時</th>
                <th scope="col">対応者</th>
                <th scope="col">操作</th>
              </tr>
            </thead>
            <tbody>
              {reports.map((report) => (
                <ReportRow
                  key={report.id}
                  report={report}
                  onProcessed={handleProcessed}
                  onTargetModerated={handleTargetModerated}
                />
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
