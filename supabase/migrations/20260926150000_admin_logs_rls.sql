-- =============================================================================
-- 20260926150000_admin_logs_rls.sql
-- admin_logs RLS - RLS ENABLE + 最小権限GRANT/REVOKE（read-only lockdown）
--
-- 対象（本migrationに含まれるもの）:
--   - public.admin_logs: anon/authenticatedのtable-level ACL最小化
--   - public.admin_logs: ENABLE ROW LEVEL SECURITY（FORCE RLSは使用しない）
--   - policy 1件: admin_logs_select_admin（SELECTのみ、他コマンドのpolicyなし）
--
-- 本migrationに含まれないもの（次フェーズで対応）:
--   - moderate_post() / moderate_comment()
--   - admin_logsへのINSERTを行う関数・helper（今回は一切作らない）
--   - posts/comments/profiles/blocks（変更禁止・無変更）
--   - public.is_admin() / public.is_active_user() /
--     internal.is_community_browsing_allowed() / internal.is_blocked_with()
--     （変更禁止・無変更）
--   - likes/reports/events/event_participants/login_attempts/app_settingsの
--     RLS・schema変更
--
-- 20260920022832_core_schema.sql（001）〜20260926120000_comments_rls.sql（013）
-- はいずれも変更しない。
--
-- -----------------------------------------------------------------------------
-- 実装前に読み取り専用で確認した事実:
--   - public.admin_logs の owner = postgres。RLS無効、policy 0件。
--   - 現在のACL: anon/authenticated/postgres/service_role いずれも
--     DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE
--     （table-level、全列）を保持。
--   - schema: id/admin_id/action/target_type/target_id/detail/created_at。
--     updated_atは存在せず、custom triggerも存在しない（内部のFK制約用
--     RI_ConstraintTriggerのみ）。append-only設計であることに変更なし。
--   - public/internal schema内のいずれの既存function（is_admin/is_active_user/
--     is_blocked_with/is_community_browsing_allowed/get_public_profiles/
--     get_public_profile/handle_new_user/set_updated_at/delete_own_post/
--     delete_own_comment）も、その定義本文にadmin_logsへの参照を一切含まない
--     ことを確認済み。admin_logsを参照するview・custom triggerも存在しない。
--     したがって、本migrationによるclient direct write禁止化によって
--     壊れる既存の書き込み経路は存在しない。
--   - frontend/serverコードにadmin_logsを操作する実装は存在しない
--     （リポジトリ全文検索で、migration SQLファイルとPROJECT_SPEC.md以外に
--     "admin_logs"という文字列を含むファイルは無い）。
--   - public.is_admin()は owner=postgres・SECURITY DEFINER・search_path=''、
--     ACLはauthenticated/postgres/service_roleのみ（無変更）。
-- -----------------------------------------------------------------------------


-- -----------------------------------------------------------------------------
-- anon: admin_logsへの全権限を明示的にREVOKEする。再GRANTは行わない。
-- -----------------------------------------------------------------------------
revoke all on table public.admin_logs from anon;


-- -----------------------------------------------------------------------------
-- authenticated: 広いtable-level権限を一度すべて取り消してから、SELECTのみを
-- 再付与する。INSERT/UPDATE/DELETEはtable privilege段階で禁止する
-- （column-level write ACLも一切付与しない）。実際に行を取得できるかどうかは
-- 後続のRLS policyに委ねる。
-- -----------------------------------------------------------------------------
revoke all on table public.admin_logs from authenticated;

grant select
  on table public.admin_logs
  to authenticated;


-- -----------------------------------------------------------------------------
-- RLSを有効化する。FORCE ROW LEVEL SECURITYは使用しない
-- （owner=postgresはBYPASSRLSであり、次フェーズで実装予定のmoderation RPC
-- （owner=postgres・SECURITY DEFINER）がadmin_logsへ書き込む際、FORCE RLSを
-- 使用していないことが前提となる）。
-- -----------------------------------------------------------------------------
alter table public.admin_logs enable row level security;


-- -----------------------------------------------------------------------------
-- admin_logs_select_admin: active adminのみbase tableから全admin_logs行を
-- SELECT可能。既存のpublic.is_admin()をそのまま利用し、独自の判定は行わない。
-- INSERT/UPDATE/DELETE policyは作成しない（adminであってもclientからの
-- 直接書き込みは一切許可しない。監査ログは信頼済みSECURITY DEFINER経路
-- 以外からは不変とする）。
-- -----------------------------------------------------------------------------
create policy admin_logs_select_admin
  on public.admin_logs
  for select
  to authenticated
  using (
    public.is_admin()
  );

-- INSERT/UPDATE/DELETE policyはいずれも作成しない。admin_logsへの書き込みは
-- 将来のmoderation RPC（owner=postgres・SECURITY DEFINER）がBYPASSRLSに
-- より実行する想定であり、client（anon/authenticated）からの直接書き込みは
-- table privilege段階（上記REVOKE）で禁止されている。
-- =============================================================================
