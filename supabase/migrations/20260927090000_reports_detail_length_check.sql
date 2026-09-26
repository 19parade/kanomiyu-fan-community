-- =============================================================================
-- 20260927090000_reports_detail_length_check.sql
-- reports.detail validation schema prep (M1)
--
-- 対象: public.reports に CHECK制約 reports_detail_length_check を1件追加するのみ。
--   detail IS NULL OR 1〜2000文字（char_length。バイトではなく文字数）
--
-- 責務分離（PROJECT_SPEC.md v1.19）:
--   - 本CHECKが保証するのは「保存済みdetailがNULL、または1〜2000文字」のみ。
--   - trim・blank-only→NULL・全角スペース/tab/改行の正規化は、将来の
--     create_report() の責務であり、本CHECKでは再実装しない。
--     したがって空白のみの文字列（半角スペース・U+3000・tab・改行のみ）は
--     本CHECK単体では通る。これは意図した設計。空文字('')は拒否される。
--
-- 事前確認: reports は0行のため既存データとの互換性問題はない。
-- RLS/ACL/trigger/他制約/他テーブルは変更しない。
-- 001〜016は変更しない。
-- =============================================================================

alter table public.reports
  add constraint reports_detail_length_check
  check (
    detail is null
    or (char_length(detail) >= 1 and char_length(detail) <= 2000)
  );
