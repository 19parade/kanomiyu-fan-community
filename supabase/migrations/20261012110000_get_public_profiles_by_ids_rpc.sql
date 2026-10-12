-- =============================================================================
-- 20261012110000_get_public_profiles_by_ids_rpc.sql
-- F5-C1 migration B: 著者バッチ取得RPC public.get_public_profiles_by_ids(uuid[])
--
-- 対象（本migrationに含まれるもの）:
--   - public.get_public_profiles_by_ids(target_ids uuid[]) の作成
--   - 上記関数の必要最小限のACL（PUBLIC REVOKE、anon/authenticated GRANT）
--
-- 本migrationに含まれないもの:
--   - public.get_public_profiles() / public.get_public_profile()（変更禁止・無変更）
--   - internal.is_blocked_with() / internal.is_community_browsing_allowed()
--     （変更禁止・無変更）
--   - profiles / posts / comments / likes / blocks のRLS・ACL・schema
--   - 既存48件のmigration
--
-- 背景（F5-B §2 推奨方式）:
--   投稿一覧（/feed）は posts を直接SELECTするが、posts.author_id から
--   著者のusername/display_name/avatar_urlを解決する経路が既存に存在しない
--   （public.profiles には他人向けSELECT policyがprofiles_select_own /
--   profiles_select_admin しかなく、PostgRESTのforeign table embedは
--   profiles側RLSに従うため他人の著者情報は常にnullになる。
--   get_public_profile(username) は単一ユーザー・username指定専用で、
--   複数author_idのバッチ取得には使えない）。本RPCはこの欠落を埋める、
--   get_public_profiles()と同一設計方針の「ID配列版」である。
--
-- 設計方針（既存 get_public_profiles() / get_public_profile() を踏襲）:
--   - 返却列は公開6列（id/username/display_name/avatar_url/bio/fan_since）
--     のみ。email/role/status/consent等は一切含めない。
--   - status IN ('active','suspended') のみ対象（banned除外。既存2RPCと
--     完全一致）。
--   - anon経路とauthenticated経路を、SQLの短絡評価に依存せず、PL/pgSQLの
--     明示的なIF分岐と独立した `return query` で構造的に分離する
--     （get_public_profiles()と同一パターン）。anon分岐には
--     internal.is_blocked_with() / internal.is_community_browsing_allowed()
--     への参照を一切含めない。
--   - authenticated経路: internal.is_community_browsing_allowed()がfalse
--     （banned、またはprofile不存在）なら0行。trueの場合のみクエリを実行し、
--     internal.is_blocked_with(p.id) で双方向block判定を適用する
--     （F5-C1でposts/comments/likesのRLSも双方向化されるため、本RPCも
--     既存のprofiles公開RPCと同じ双方向判定方式のまま、新規の判定ロジックを
--     考案しない）。
--   - SECURITY DEFINER・search_path=''固定。参照オブジェクトはすべて
--     schema-qualified。動的SQLは使用しない。
--
-- 入力の安全な取り扱い（F5-C1指示の要件）:
--   - target_ids が NULL の場合は0件を返す（エラーにしない）。
--   - 配列内のNULL要素は unnest(...) where x is not null で除去する。
--   - 重複IDは distinct で排除したうえで内部変数 v_ids に格納する。
--     もっとも、最終的な `where p.id = any(v_ids)` は profiles.id が
--     主キー（1 IDにつき最大1行）であるため、入力配列に重複が残っていた
--     としても出力行が重複することはない（distinct処理は上限件数カウントの
--     正確性のために行う、出力の重複防止そのものは主キー制約が担保する）。
--   - 重複排除後のID件数が50件を超える場合は例外 'TOO_MANY_PROFILE_IDS' を
--     発生させる（50件は呼び出し側のバグ・想定外の大量リクエストを示す
--     可能性が高く、get_public_profiles()のpage_sizeのような「安全な範囲へ
--     自動clamp」ではなく、明示的に拒否して呼び出し側に気づかせる設計とする。
--     ページングの概念を持たない一括バッチ取得APIであるため、黙って一部だけ
--     返すと呼び出し側が結果の欠落に気づけないリスクがある）。
--   - 重複排除後0件（NULL配列・空配列・NULL要素のみの配列）の場合は、
--     例外にせずそのまま0件を返す（existence oracleを作らない。不正な
--     要求ではなく「対象なし」という正常な入力として扱う）。
--   - target_idsの各要素はPostgRESTの型変換レイヤーでuuid型として検証
--     されるため、非UUID文字列が関数本体に到達することはない
--     （本関数内で改めて文字列形式の検証は行わない）。
--
-- ACL: PUBLIC からEXECUTEを取り消し、anon・authenticated双方へ付与する
--   （get_public_profiles() / get_public_profile() と同一方針。公開
--   プロフィール情報のバッチ取得は匿名访问者にも必要）。
--   service_role は public スキーマのdefault privilegeにより自動付与される
--   見込み（既存RPCと同じ既知の挙動。static review時点では未適用のため
--   実際の付与状況はdb push後に確認する）。
--
-- 本migrationは静的SQLレビューのみを行っており、検証プロジェクトへの
-- db push・BEGIN/ROLLBACKを伴うDDL probeは実施していない。
-- 20260920022832〜20261012100000（既存48件＋migration A）はいずれも変更しない。
-- =============================================================================

create function public.get_public_profiles_by_ids(
  target_ids uuid[]
)
returns table (
  id uuid,
  username text,
  display_name text,
  avatar_url text,
  bio text,
  fan_since date
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_ids uuid[];
begin
  -- NULL配列は「対象なし」として0件を返す（エラーにしない）。
  if target_ids is null then
    return;
  end if;

  -- 配列内のNULL要素を除去し、重複を排除する。
  select array_agg(distinct t.x)
    into v_ids
    from unnest(target_ids) as t(x)
    where t.x is not null;

  -- 有効な要素が1件もない（空配列・NULL要素のみ）場合は0件を返す。
  if v_ids is null or array_length(v_ids, 1) is null then
    return;
  end if;

  if array_length(v_ids, 1) > 50 then
    raise exception 'TOO_MANY_PROFILE_IDS';
  end if;

  if auth.uid() is null then
    -- anon経路: block判定を一切行わない。internal.is_blocked_with()への
    -- 参照はこの分岐に存在しない。
    return query
      select
        p.id, p.username, p.display_name, p.avatar_url, p.bio, p.fan_since
      from public.profiles p
      where p.id = any(v_ids)
        and p.status in ('active', 'suspended');
    return;
  end if;

  -- authenticated経路: is_community_browsing_allowed()がfalse
  -- （banned、またはprofile不存在）なら0行。
  if not internal.is_community_browsing_allowed() then
    return;
  end if;

  return query
    select
      p.id, p.username, p.display_name, p.avatar_url, p.bio, p.fan_since
    from public.profiles p
    where p.id = any(v_ids)
      and p.status in ('active', 'suspended')
      and not internal.is_blocked_with(p.id);
end;
$$;

revoke execute on function public.get_public_profiles_by_ids(uuid[]) from public;
grant execute on function public.get_public_profiles_by_ids(uuid[]) to anon;
grant execute on function public.get_public_profiles_by_ids(uuid[]) to authenticated;
-- =============================================================================
