-- =============================================================================
-- 20260927170000_security_baseline_lockdown.sql
-- Security baseline lockdown (M9)
--
-- 背景（Security Exposure Audit）:
--   events / event_participants / news / songs / login_attempts / app_settings の
--   6テーブルは、RLS無効かつpolicy 0件のまま、anon / authenticated にtableの
--   全権限が付与されており、クライアントから直接読み書きできる状態だった
--   （login_attempts のPII読み取り・ロックアウト攻撃・rate limit回避、
--    app_settings の規約version改ざん・単一行のDELETEによるsignup停止、
--    events / news / songs の内容改ざん、event_participants のなりすまし等）。
--   原因の1つは、publicスキーマでpostgresが作成するtableに対して、default
--   privilegeがanon / authenticated へtableの全権限を自動付与していること。
--
-- 本migrationの範囲（deny-by-default baseline）:
--   Block A: 既存6テーブルから anon / authenticated の全権限をREVOKEし、
--            ROW LEVEL SECURITY を有効化する（FORCEはしない。policyは作らない）。
--            これにより6テーブルはクライアントroleから直接アクセスできなくなる。
--            公開SELECT等が必要なtableの最終boundary（policy・GRANT・RPC）は、
--            各tableの後続migrationで必要な範囲だけ復活させる。
--   Block B: postgresがpublicスキーマに今後作成するtableに対するdefault privilege
--            から、anon / authenticated を除去する。
--
-- 変更しないもの:
--   - postgres / service_role のtable ACL（BYPASSRLSのため、service_role・
--     SECURITY DEFINER関数（handle_new_user() 等、owner=postgres）は影響を受けない）
--   - service_role のdefault privilege、sequence / function / type のdefault
--     privilege、schema権限、auth / storage schema、supabase_admin のdefault privilege
--   - 6テーブル以外のtable、function、trigger、列・制約・index、データ
--     （app_settings の既存1行を含む。DMLは行わない）
--
-- default privilegeの変更は今後作成されるtableにのみ効き、既存tableには遡及しない
-- （そのため Block A を別途実施する）。
-- 001〜024は変更しない。
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Block A: 既存6テーブルのdeny-by-default化
-- -----------------------------------------------------------------------------
revoke all on table public.events from anon;
revoke all on table public.events from authenticated;
alter table public.events enable row level security;

revoke all on table public.event_participants from anon;
revoke all on table public.event_participants from authenticated;
alter table public.event_participants enable row level security;

revoke all on table public.news from anon;
revoke all on table public.news from authenticated;
alter table public.news enable row level security;

revoke all on table public.songs from anon;
revoke all on table public.songs from authenticated;
alter table public.songs enable row level security;

revoke all on table public.login_attempts from anon;
revoke all on table public.login_attempts from authenticated;
alter table public.login_attempts enable row level security;

revoke all on table public.app_settings from anon;
revoke all on table public.app_settings from authenticated;
alter table public.app_settings enable row level security;

-- -----------------------------------------------------------------------------
-- Block B: 今後postgresが作成するpublicスキーマのtableのdefault privilege
--   anon / authenticated への自動付与を除去する（service_roleは変更しない）。
-- -----------------------------------------------------------------------------
alter default privileges for role postgres in schema public
  revoke all on tables from anon;
alter default privileges for role postgres in schema public
  revoke all on tables from authenticated;
