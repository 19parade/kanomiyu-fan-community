-- =============================================================================
-- 20260927110000_reports_rls.sql
-- reports RLS + base-table ACL lockdown (M3)
--
-- 対象: public.reports のみ。
--   - anon: 全権限をREVOKE
--   - authenticated: 全権限をREVOKEしたうえでSELECTのみGRANT（列単位GRANTなし）
--   - ROW LEVEL SECURITY を ENABLE（FORCEはしない）
--   - policy は reports_select_admin の1件のみ（FOR SELECT / authenticated /
--     USING public.is_admin()）
--
-- 設計（PROJECT_SPEC.md 6.7・v1.19）:
--   - 管理者（role='admin' かつ status='active'）のみ base table を全件SELECTできる。
--   - reporter本人向けのbase-table SELECT policyは作らない。本人の通報一覧は
--     将来の get_my_reports() RPC（handled_by/reporter_id等を除いた安全な列のみ）
--     で提供する。
--   - INSERT/UPDATE/DELETE policyは作らず、table権限も与えない。クライアントからの
--     直接書き込みは管理者を含めて不可。通報作成は将来の create_report()、
--     管理者処理は将来のSECURITY DEFINER RPC経由のみ。
--   - postgres / service_role のACLは変更しない。これらはBYPASSRLSのため、
--     M2の internal.enforce_report_rate_limit()（SECURITY DEFINER, owner=postgres）は
--     RLSの影響を受けずcountできる。FORCE RLSは使用しない。
--
-- 新しいfunction / helper / RPC / trigger / schema・列・制約・indexの変更はなし。
-- 001〜018は変更しない。
-- =============================================================================

revoke all on table public.reports from anon;
revoke all on table public.reports from authenticated;
grant select on table public.reports to authenticated;

alter table public.reports enable row level security;

create policy reports_select_admin
  on public.reports
  for select
  to authenticated
  using (public.is_admin());
