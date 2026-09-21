-- =============================================================================
-- 20260921063926_community_browsing_helper.sql
-- Authorization Helpersフェーズ（2本目） - community browsing判定用internal helper
--
-- 対象（本migrationに含まれるもの）:
--   - internal.is_community_browsing_allowed() 関数の作成
--   - 上記関数に関する必要最小限のACL設定（PUBLICからのREVOKEのみ）
--
-- 本migrationに含まれないもの（後続migrationで対応）:
--   - public.get_public_profiles() / public.get_public_profile()
--   - internal.public_profile_columns() 等のprofile共有helper
--   - profiles / blocks その他13テーブルのRLS policy・ENABLE ROW LEVEL SECURITY
--   - liker RPC / event participant RPC / report RPC / consent RPC / admin RPC
--   - rate limit / Storage / Next.jsコード
--
-- 20260920022832_core_schema.sql（001）・20260920052609_authorization_helpers.sql（002）・
-- 20260920054819_fix_authorization_helper_acl.sql（003）・
-- 20260920120721_signup_db_foundation.sql（004）・
-- 20260921060119_events_lifecycle_schema_prep.sql（005）・
-- 20260921061635_block_authorization_helper.sql（006）はいずれも変更しない。
-- 既存の internal.is_blocked_with()・internal schemaへのauthenticated USAGEは変更しない。
--
-- -----------------------------------------------------------------------------
-- 用途:
--   public_profiles公開方式としてSECURITY DEFINER table-returning RPC
--   （public.get_public_profiles() / public.get_public_profile()、今回は未実装）
--   を採用することがPM側で確定した。これらのRPCが「呼び出し元authenticated
--   userが通常のcommunity閲覧（他ユーザーの公開プロフィール閲覧等）を許可される
--   statusかどうか」を判定するための前提となるinternal primitiveを、本migration
--   で先行して用意する。
--
--   is_active_user()はactiveのみtrueを返す設計のため、
--   「active/suspendedを許可しbannedのみ拒否する」という今回の用途には使えない。
--   このため専用のhelperとして新設する。
--
--   本関数は現時点では、公開RPC等のSECURITY DEFINER関数の内部からのみ
--   呼び出される想定のinternal primitiveであり、anon/authenticatedへの
--   直接EXECUTE権限は付与しない（postgres所有のSECURITY DEFINER関数同士の
--   内部呼び出しはowner権限で評価されるため、直接の実行権限がなくても
--   内部から利用できる）。将来、RLS policyから直接この関数を呼び出す必要が
--   生じた場合は、その時点で改めてauthenticatedへのEXECUTE付与を検討する。
-- -----------------------------------------------------------------------------
create function internal.is_community_browsing_allowed()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    where profiles.id = auth.uid()
      and profiles.status in ('active', 'suspended')
  );
$$;

-- PUBLICへのEXECUTEを明示的にREVOKEする（internal schema自体にはSupabaseの
-- default privilegeが及ばないため通常は不要だが、既存のis_blocked_with()と
-- 同様に明示性を優先する）。anon/authenticated/service_roleへのGRANTは
-- 一切行わない（付与しない、というのが今回の方針であり、REVOKE対象となる
-- 既存の付与も存在しない）。
revoke execute on function internal.is_community_browsing_allowed() from public;
-- =============================================================================
