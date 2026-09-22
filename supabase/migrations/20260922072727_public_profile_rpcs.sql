-- =============================================================================
-- 20260922072727_public_profile_rpcs.sql
-- Public Profile RPCフェーズ - public.get_public_profiles() / public.get_public_profile()
--
-- 対象（本migrationに含まれるもの）:
--   - public.get_public_profiles(search, after_username, after_id, page_size)
--   - public.get_public_profile(target_username)
--   - 上記2関数の必要最小限のACL設定（PUBLIC REVOKE、anon/authenticated GRANT）
--
-- 本migrationに含まれないもの（後続migrationで対応）:
--   - internal.public_profile_columns() 等の共有helper（今回は作らない方針）
--   - profiles / blocks その他13テーブルのRLS policy・ENABLE ROW LEVEL SECURITY
--   - liker RPC / event participant RPC / report RPC / consent RPC / admin RPC
--   - rate limit / Storage / Next.jsコード
--   - 11節で指摘するインデックス追加（懸念事項として報告のみ）
--
-- 20260920022832_core_schema.sql（001）〜20260921063926_community_browsing_helper.sql（007）
-- はいずれも変更しない。internal.is_blocked_with()・internal.is_community_browsing_allowed()
-- のシグネチャ・ACLも変更しない。base public.profiles / public.blocks のACL・RLSも変更しない。
--
-- -----------------------------------------------------------------------------
-- 実装前に読み取り専用で確認した事実:
--   - public.profiles には profiles_pkey(id) と profiles_username_key(username, UNIQUE)
--     のみが存在し、status単体・(status, username)の複合indexは存在しない。
--   - public.blocks には blocks_pkey(id) と blocks_blocker_blocked_key
--     (blocker_id, blocked_id の UNIQUE複合index) のみが存在し、
--     (blocked_id, blocker_id) 方向の逆引きindexは存在しない。
--   - username/display_nameへの部分一致検索（ILIKE '%...%'）を効率化する
--     trigram(pg_trgm)等のindexも存在しない。
--   - これらのインデックスに関する所見は、必要性が明確でない追加を独断で
--     行わないというご指示に従い、migration本体には反映せず、完了報告の
--     懸念事項としてのみ提示する。
-- -----------------------------------------------------------------------------


-- -----------------------------------------------------------------------------
-- public.get_public_profiles(search, after_username, after_id, page_size)
--
-- fan一覧（/fans）用。公開6列（id/username/display_name/avatar_url/bio/
-- fan_since）のみを返す。statusはWHERE句の絞り込みにのみ使用し、返却しない。
--
-- anon/authenticatedの経路は、SQLのブール式短絡評価に一切依存せず、
-- PL/pgSQLの明示的なIF分岐と、分岐ごとに独立した `return query` によって
-- 構造的に分離する。anon分岐のクエリ本文には internal.is_blocked_with() /
-- internal.is_community_browsing_allowed() への参照が一切含まれない
-- （字面上・実行経路上のいずれでも、これらのinternal helperがanon経路で
-- 評価されることはない）。
--
-- SECURITY DEFINER・search_path=''固定。参照オブジェクト（public.profiles・
-- internal.is_blocked_with・internal.is_community_browsing_allowed・
-- auth.uid()）はすべてschema-qualified。動的SQLは使用しない。
-- SECURITY DEFINER関数の内部呼び出しはowner（postgres）権限で評価されるため、
-- internal helperへのEXECUTE権限をanon/authenticatedへ新たに付与する必要は
-- ない（既存ACLは変更しない）。
-- -----------------------------------------------------------------------------
create function public.get_public_profiles(
  search text default null,
  after_username text default null,
  after_id uuid default null,
  page_size int default 20
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
  v_search text;
  v_page_size int;
begin
  -- page_size: NULLならデフォルト20。範囲外は[1,100]へclamp（4節参照。
  -- エラーにはせず、常に安全な範囲へ丸める設計とする）。
  if page_size is null then
    v_page_size := 20;
  else
    v_page_size := least(greatest(page_size, 1), 100);
  end if;

  -- search: 前後空白をtrimし、空文字になった場合は検索条件なし扱いとする。
  v_search := nullif(btrim(search), '');

  -- cursor: after_username / after_id は「両方NULL（先頭ページ）」または
  -- 「両方指定（keyset cursorとして使用）」のいずれかのみ有効とする。
  -- 片方だけ指定された場合は曖昧なcursorとして扱わず、固定例外
  -- 'INVALID_PROFILE_CURSOR' を発生させる。cursor不正はprofile不存在・
  -- banned・blocked等の対象ユーザーのsecurity情報ではないため、0行で
  -- 黙って握りつぶさず、最終ページ・clientのcursor生成バグ・パラメータ
  -- 送信漏れ等と区別できる形で明示的に失敗させる。username・uuid・内部
  -- 状態等はメッセージへ含めない。
  if (after_username is null) <> (after_id is null) then
    raise exception 'INVALID_PROFILE_CURSOR';
  end if;

  if auth.uid() is null then
    -- anon経路: block判定を一切行わない。internal.is_blocked_with()への
    -- 参照はこの分岐に存在しない。
    return query
      select
        p.id, p.username, p.display_name, p.avatar_url, p.bio, p.fan_since
      from public.profiles p
      where p.status in ('active', 'suspended')
        and (
          v_search is null
          or p.username ilike ('%' || v_search || '%')
          or p.display_name ilike ('%' || v_search || '%')
        )
        and (
          after_username is null
          or (p.username, p.id) > (after_username, after_id)
        )
      order by p.username asc, p.id asc
      limit v_page_size;
    return;
  end if;

  -- authenticated経路: is_community_browsing_allowed()がfalse
  -- （banned、またはprofile不存在）なら0行を返す。
  if not internal.is_community_browsing_allowed() then
    return;
  end if;

  return query
    select
      p.id, p.username, p.display_name, p.avatar_url, p.bio, p.fan_since
    from public.profiles p
    where p.status in ('active', 'suspended')
      and (
        v_search is null
        or p.username ilike ('%' || v_search || '%')
        or p.display_name ilike ('%' || v_search || '%')
      )
      and (
        after_username is null
        or (p.username, p.id) > (after_username, after_id)
      )
      and not internal.is_blocked_with(p.id)
    order by p.username asc, p.id asc
    limit v_page_size;
end;
$$;

revoke execute on function public.get_public_profiles(text, text, uuid, int) from public;
grant execute on function public.get_public_profiles(text, text, uuid, int) to anon;
grant execute on function public.get_public_profiles(text, text, uuid, int) to authenticated;


-- -----------------------------------------------------------------------------
-- public.get_public_profile(target_username)
--
-- /fans/[username] 用。usernameで1件検索し、公開6列のみを返す。
-- 「username不存在」「target banned」「block関係あり」「banned caller」は
-- いずれも0行という同一の結果にし、理由を外部から区別させない
-- （existence oracle対策）。
--
-- 設計・ACL方針は get_public_profiles() と同一。
-- -----------------------------------------------------------------------------
create function public.get_public_profile(
  target_username text
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
  v_username text;
begin
  -- NULL/空白のみのusernameは、例外を発生させず0行として扱う
  -- （内部情報を漏らさない）。
  v_username := nullif(btrim(target_username), '');

  if v_username is null then
    return;
  end if;

  if auth.uid() is null then
    return query
      select
        p.id, p.username, p.display_name, p.avatar_url, p.bio, p.fan_since
      from public.profiles p
      where p.username = v_username
        and p.status in ('active', 'suspended')
      limit 1;
    return;
  end if;

  if not internal.is_community_browsing_allowed() then
    return;
  end if;

  return query
    select
      p.id, p.username, p.display_name, p.avatar_url, p.bio, p.fan_since
    from public.profiles p
    where p.username = v_username
      and p.status in ('active', 'suspended')
      and not internal.is_blocked_with(p.id)
    limit 1;
end;
$$;

revoke execute on function public.get_public_profile(text) from public;
grant execute on function public.get_public_profile(text) to anon;
grant execute on function public.get_public_profile(text) to authenticated;
-- service_roleへは今回新たなGRANT/REVOKEを行わない。publicスキーマの
-- default privilegeにより自動的にEXECUTEが付与される見込みであり、これは
-- 既存のis_admin()等と同じ既知の挙動として許容する（静的レビュー時に
-- 実際の付与状況を確認し、報告する）。
-- =============================================================================
