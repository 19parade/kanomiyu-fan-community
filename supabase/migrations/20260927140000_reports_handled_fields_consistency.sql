-- =============================================================================
-- 20260927140000_reports_handled_fields_consistency.sql
-- reports.status と handled_by / handled_at の整合CHECK (M6)
--
-- 対象: public.reports に CHECK制約 reports_handled_fields_consistency_check を
--   1件追加するのみ。
--
-- 意味:
--   - handled_by = 最終判断（resolved / rejected）を行った管理者
--   - handled_at = 最終判断が完了した日時
--   よって
--     pending / reviewing : handled_by IS NULL AND handled_at IS NULL
--     resolved / rejected : handled_by IS NOT NULL AND handled_at IS NOT NULL
--   reviewing へ遷移させた管理者はreportsには保存しない（将来の通報処理RPCが
--   admin_logs にtransition actorとして記録する）。
--
-- 目的: 将来の通報処理RPCだけでなく、postgres / service_role / 将来のmigration等の
--   trusted経路からも、status と handled系列の不整合な行が入らないようにする
--   (defense-in-depth)。status は NOT NULL かつ既存の reports_status_check で
--   4値に限定されており、handled_by / handled_at は IS [NOT] NULL でのみ評価する
--   ため、式は各組合せで必ず true / false のどちらかになる（NULLに評価されない）。
--
-- 事前確認: reports は0行で、既存データとの不整合はない。
-- status CHECK / 他の制約 / RLS / ACL / trigger / 関数 / 他テーブルは変更しない。
-- 通報処理RPC（process_report）は本migrationでは作成しない。
-- 001〜021は変更しない。
-- =============================================================================

alter table public.reports
  add constraint reports_handled_fields_consistency_check
  check (
    (
      status in ('pending', 'reviewing')
      and handled_by is null
      and handled_at is null
    )
    or
    (
      status in ('resolved', 'rejected')
      and handled_by is not null
      and handled_at is not null
    )
  );
