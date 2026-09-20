-- =============================================================================
-- 20260920052609_authorization_helpers.sql
-- PROJECT_SPEC.md v1.16 準拠 - 認可判定用ヘルパー関数
--
-- 対象:
--   - public.is_admin()        (8章「管理者判定とRLSの循環参照回避」)
--   - public.is_active_user()  (8章「is_active_user()関数（確定）」)
--
-- 本migrationに含まれるもの:
--   - 上記2関数の作成
--   - 各関数へのEXECUTE権限の明示的な制限（PUBLICからREVOKE、authenticatedへのみGRANT）
--
-- 本migrationに含まれないもの（後続migrationで対応）:
--   - auth.users -> profiles signup trigger
--   - RLS有効化・RLSポリシー（本関数をポリシーから呼び出す設定を含む）
--   - profilesの列単位GRANT/REVOKE
--   - public_profiles VIEW
--   - admin_set_user_role() / admin_set_user_status() / record_policy_consent()
--   - レート制限トリガー・login_attemptsの並行処理対策
--   - Storage buckets / Storage policies
--
-- 001（20260920022832_core_schema.sql）は変更しない。
-- =============================================================================


-- -----------------------------------------------------------------------------
-- public.is_admin()
--
-- 呼び出し元自身（auth.uid()）のprofilesが、role='admin' かつ status='active'
-- である場合のみ true を返す。admin roleでもsuspended/bannedならfalse。
-- profileが存在しない場合・未認証（auth.uid()がnull）の場合もfalse（NULLは返さない）。
--
-- SECURITY DEFINERとし、search_pathを空文字に固定する。本体内で参照する
-- オブジェクト（public.profiles, auth.uid()）はすべてschema-qualifiedで
-- 記述し、search_pathにpublic等を追加する方式は採らない。
-- LEAKPROOF・STRICTは指定しない。OWNERの変更も行わない。
-- -----------------------------------------------------------------------------
create function public.is_admin()
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
      and profiles.role = 'admin'
      and profiles.status = 'active'
  );
$$;

revoke execute on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;
-- anon には GRANT しない。service_role にも今回は明示的に GRANT しない。


-- -----------------------------------------------------------------------------
-- public.is_active_user()
--
-- 呼び出し元自身（auth.uid()）のprofilesが status='active' である場合のみ
-- true を返す（roleは問わない）。profileが存在しない場合・未認証の場合はfalse
-- （NULLは返さない）。
--
-- is_admin()と同様にSECURITY DEFINER・search_path=''・完全修飾名参照とし、
-- LEAKPROOF・STRICTは指定せず、OWNERの変更も行わない。
-- -----------------------------------------------------------------------------
create function public.is_active_user()
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
      and profiles.status = 'active'
  );
$$;

revoke execute on function public.is_active_user() from public;
grant execute on function public.is_active_user() to authenticated;
-- anon には GRANT しない。service_role にも今回は明示的に GRANT しない。
-- =============================================================================
