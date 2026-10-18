/**
 * F5-D4b: reports.status の4値（PROJECT_SPEC.md 6.7、
 * reports_status_check CHECK制約と一致）。process_report()が許可する遷移は
 * pending→reviewing/resolved/rejected、reviewing→resolved/rejected の5通り
 * のみ（他11通りはINVALID_REPORT_TRANSITION）。
 *
 * ラベルは意図的に「対象を非表示にした」ことを一切示唆しない —
 * 通報の処理（このstatus）と対象のmoderation（moderate_post/comment）は
 * 完全に別操作（process_report()のdoc comment / PROJECT_SPEC.md「対象の
 * moderationとの分離」参照）。
 */
export type ReportStatus = "pending" | "reviewing" | "resolved" | "rejected";

export const REPORT_STATUS_LABELS: Record<ReportStatus, string> = {
  pending: "未対応",
  reviewing: "確認中",
  resolved: "解決済み",
  rejected: "却下",
};

// For UI filters: "all" (no server-side status filter) plus the 4 real values.
export const REPORT_STATUS_FILTER_OPTIONS: Array<{ value: ReportStatus | "all"; label: string }> = [
  { value: "all", label: "すべて" },
  { value: "pending", label: "未対応" },
  { value: "reviewing", label: "確認中" },
  { value: "resolved", label: "解決済み" },
  { value: "rejected", label: "却下" },
];

/**
 * The only 5 legal transitions process_report() accepts. Used to compute
 * which "次の状態" options to offer for a given report, so the UI never
 * offers a button that process_report() would reject as
 * INVALID_REPORT_TRANSITION (defense-in-depth only — the RPC itself is the
 * real boundary; a stale client-side status can still race another admin,
 * see §762 of PROJECT_SPEC.md, which the RPC's own row lock resolves).
 */
export const REPORT_ALLOWED_NEXT_STATUSES: Record<ReportStatus, ReportStatus[]> = {
  pending: ["reviewing", "resolved", "rejected"],
  reviewing: ["resolved", "rejected"],
  resolved: [],
  rejected: [],
};

export const REPORT_TARGET_TYPE_LABELS: Record<string, string> = {
  post: "投稿",
  comment: "コメント",
  profile: "会員プロフィール",
};
