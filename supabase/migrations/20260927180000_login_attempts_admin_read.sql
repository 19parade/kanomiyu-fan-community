-- =============================================================================
-- 20260927180000_login_attempts_admin_read.sql
-- login_attempts の admin read boundary (M10)
--
-- 対象: public.login_attempts のSELECT境界のみ。
--   - authenticated への SELECT GRANT（1件）
--   - policy login_attempts_select_admin（FOR SELECT TO authenticated
--     USING (public.is_admin())）（1件）
--
-- 仕様（PROJECT_SPEC.md 8章 RLS表）: login_attempts はactive admin
-- （public.is_admin()）のみSELECT可。クライアントからのINSERT/UPDATE/DELETEは不可で、
-- 記録・クリアはサーバーサイド処理からのみ行う。
--
-- 状態:
--   - RLSはM9で有効化済み（FORCEなし）。本migrationでは再設定しない。
--   - authenticated はtable privilegeとしてはSELECTのみを持つが、policyにより
--     active admin以外（一般ユーザー・suspended/bannedのadmin・profile不在・
--     auth.uid()がNULL）は常に0行となる。
--   - anon は権限なし（M9の状態を維持。policyもanon向けには作らない）。
--   - INSERT / UPDATE / DELETE の権限・policyは作らない（active adminも
--     client直接writeは不可＝read-only）。
--   - postgres / service_role のACLは変更しない。
--   - is_admin() は login_attempts を参照しないため、policyの再帰は起きない。
--
-- 含めないもの: ログイン失敗の記録・lockout判定・成功時のクリアを行うRPC / 経路
--   （Next.jsのログイン処理・IP取得・trusted server boundary の設計後に別途実装する。
--   anon/authenticatedが呼べる記録RPCは任意emailへの失敗履歴の注入を許すため作らない）。
-- email / ip_address を含むため、admin管理目的以外の公開経路は設けない。
-- 001〜025は変更しない。
-- =============================================================================

grant select on table public.login_attempts to authenticated;

create policy login_attempts_select_admin
  on public.login_attempts
  for select
  to authenticated
  using (public.is_admin());
