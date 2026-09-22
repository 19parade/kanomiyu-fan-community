-- =============================================================================
-- 20260922075059_profiles_rls_4a.sql
-- profiles RLS 4a - RLS ENABLE + 最小権限GRANT/REVOKE
--
-- 対象（本migrationに含まれるもの）:
--   - public.profiles: anon/authenticatedのtable-level ACL最小化
--   - public.profiles: authenticatedへのcolumn-level UPDATE GRANT（4列のみ）
--   - public.profiles: ENABLE ROW LEVEL SECURITY（FORCE RLSは使用しない）
--   - policy 3件: profiles_select_own / profiles_select_admin / profiles_update_own
--
-- 本migrationに含まれないもの（後続migrationで対応）:
--   - admin_set_user_role() / admin_set_user_status() / record_policy_consent()
--     （現時点でremoteに存在しないことを確認済み。4a適用後はrole/status/consent
--     の変更経路が一般clientから一切無い状態になるが、これは意図した仕様であり、
--     4a自体をブロックしない）
--   - posts/comments/likes/events/event_participants/reports/blocks/news/songs/
--     admin_logs/login_attempts/app_settingsのRLS
--   - Public Profile RPC・internal helperの変更（いずれも変更禁止・無変更）
--   - rate limit / Storage / Next.jsコード / index追加
--
-- 20260920022832_core_schema.sql（001）〜20260922072727_public_profile_rpcs.sql（008）
-- はいずれも変更しない。
--
-- -----------------------------------------------------------------------------
-- 実装前に読み取り専用で再確認した事実（前回調査からのdriftなし）:
--   - public.profiles の owner = postgres。
--   - 現在のACL: anon/authenticated/postgres/service_role いずれも
--     DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE
--     （table-level、全列）を保持。RLSは無効、policyは0件。
--   - postgres・service_role は rolbypassrls=true（RLSを常に無条件でバイパス）。
--     anon・authenticated は rolbypassrls=false。
--   - public.handle_new_user() / public.is_admin() / public.is_active_user() /
--     public.get_public_profiles() / public.get_public_profile() /
--     internal.is_blocked_with() / internal.is_community_browsing_allowed()
--     はいずれも owner=postgres・SECURITY DEFINER・search_path=''。
--   - public.set_updated_at() は owner=postgres だが SECURITY DEFINER ではない
--     （通常のtrigger関数）。
--   - profiles_set_updated_at（BEFORE UPDATE ON public.profiles）は無変更。
--
-- 上記の通り、postgres所有のSECURITY DEFINER関数（signup trigger・Public
-- Profile RPC・admin/active判定helper・block判定helper）は、いずれもpostgres
-- のBYPASSRLS属性により、本migrationのRLS ENABLE・ACL変更の影響を受けない。
-- したがって本migrationは、これらの既存機能を壊さずにprofilesの直接アクセス
-- 経路のみを最小権限化する。
-- -----------------------------------------------------------------------------


-- -----------------------------------------------------------------------------
-- anon: profilesへの全権限を明示的にREVOKEする。
-- 公開プロフィール閲覧は008の public.get_public_profiles() /
-- public.get_public_profile()（SECURITY DEFINER）経由のみとし、base
-- public.profilesを一般公開用途に使わせない。
-- -----------------------------------------------------------------------------
revoke all on table public.profiles from anon;


-- -----------------------------------------------------------------------------
-- authenticated: table-level UPDATEを含む不要な権限を先にREVOKEしてから、
-- 許可4列（display_name/avatar_url/bio/fan_since）だけをcolumn-level GRANTする。
-- table-level UPDATEを残した状態でcolumn-level GRANTを追加しても4列限定には
-- ならないため、この順序（先にtable-level UPDATEをREVOKE）を厳守する。
-- table-level SELECTは維持する（自分の行のみRLSで許可する前提）。
-- -----------------------------------------------------------------------------
revoke insert, update, delete, maintain, references, trigger, truncate
  on table public.profiles from authenticated;

grant update (display_name, avatar_url, bio, fan_since)
  on table public.profiles to authenticated;


-- -----------------------------------------------------------------------------
-- RLSを有効化する。FORCE ROW LEVEL SECURITYは使用しない
-- （owner=postgresはBYPASSRLSであり、FORCE RLSはBYPASSRLSロールには
-- 影響しないため、postgres所有のSECURITY DEFINER関数群の動作に変化はない）。
-- -----------------------------------------------------------------------------
alter table public.profiles enable row level security;


-- -----------------------------------------------------------------------------
-- profiles_select_own: 本人は自分の行を、statusに関わらず（active/suspended/
-- banned問わず）SELECT可能。
-- -----------------------------------------------------------------------------
create policy profiles_select_own
  on public.profiles
  for select
  to authenticated
  using (profiles.id = auth.uid());


-- -----------------------------------------------------------------------------
-- profiles_select_admin: active adminはbase profilesから任意の行をSELECT可能
-- （moderation用のbase-table経路）。既存のpublic.is_admin()をそのまま利用し、
-- 独自のadmin判定は実装しない。このpolicyはfan-facingのPublic Profile RPCに
-- block bypassを与えるものではない（RPC側は今回一切変更しない）。
-- -----------------------------------------------------------------------------
create policy profiles_select_admin
  on public.profiles
  for select
  to authenticated
  using (public.is_admin());


-- -----------------------------------------------------------------------------
-- profiles_update_own: active本人のみ自分の行をUPDATE可能。実際に変更できる
-- 列はRLSではなく前述のcolumn-level GRANTで4列に限定される二重防御。
-- USING（更新対象行の絞り込み）とWITH CHECK（更新後の行の検証）の両方に
-- 本人判定・active判定を明示する。
-- -----------------------------------------------------------------------------
create policy profiles_update_own
  on public.profiles
  for update
  to authenticated
  using (
    profiles.id = auth.uid()
    and public.is_active_user()
  )
  with check (
    profiles.id = auth.uid()
    and public.is_active_user()
  );

-- INSERT/DELETE policyは作成しない（profile作成はhandle_new_user() trigger
-- 経由のみ、物理DELETEは全ロール不可のため、client向けの直接INSERT/DELETE
-- 経路自体が存在しない）。anon向けpolicyも作成しない（anonはtable-level
-- 権限自体を持たないため、policyの対象にならない）。
-- =============================================================================
