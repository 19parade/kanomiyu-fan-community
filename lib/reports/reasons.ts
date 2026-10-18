/**
 * F5-D4a: reports.reason の16種類固定値。
 * PROJECT_SPEC.md 6.7「reasonコードの一覧（確定）」と、
 * supabase/migrations/20260920022832_core_schema.sql の
 * reports_reason_check CHECK制約に完全一致させている（順序もそのまま踏襲）。
 * create_report() も同じ16値の完全一致のみを受け付け、trim/lower等の
 * 自動補正はしない — ここで定義する value 文字列は絶対に変更しないこと。
 */
export const REPORT_REASONS = [
  { value: "defamation", label: "誹謗中傷" },
  { value: "threats", label: "脅迫" },
  { value: "discrimination", label: "差別" },
  { value: "harassment", label: "嫌がらせ" },
  { value: "personal_info_exposure", label: "個人情報の投稿" },
  { value: "impersonation", label: "なりすまし" },
  { value: "fraud", label: "詐欺" },
  { value: "ticket_scalping", label: "チケット転売" },
  { value: "illegal_activity", label: "違法行為" },
  { value: "unauthorized_repost", label: "無断転載" },
  { value: "copyright_infringement", label: "著作権侵害" },
  { value: "full_lyrics_posting", label: "歌詞全文の掲載" },
  { value: "unauthorized_media_posting", label: "無断画像・動画の掲載" },
  { value: "spam", label: "スパム" },
  { value: "dating_solicitation", label: "出会い目的のみの利用" },
  { value: "other", label: "その他" },
] as const;

export type ReportReason = (typeof REPORT_REASONS)[number]["value"];

export const REPORT_DETAIL_MAX_LENGTH = 2000;
