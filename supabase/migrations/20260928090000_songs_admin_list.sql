-- =============================================================================
-- 20260928090000_songs_admin_list.sql
-- songs のadmin一覧 (S4a): public.get_admin_songs()
--
-- 対象: public.get_admin_songs() の作成とEXECUTE ACLのみ。songs のtable・列・制約・index・
--   trigger・RLS・policy・ACL、get_public_songs() / get_public_song()（S2・S3）、他の
--   function・table・default privilegeは変更しない。songsのbase tableは引き続きクライアント
--   から全拒否（admin一覧もこのSECURITY DEFINER RPC経由のみ）。detail・create・update・
--   status変更・DELETE・Storageは追加しない。
--
-- get_admin_songs(search, status_filter, after_release_date, after_id, page_size)
--   -> TABLE (id uuid, title text, release_date date, status text, updated_at timestamptz)
--   - public.is_admin()（active adminのみ）でなければ SONG_MANAGEMENT_NOT_AUTHORIZED
--     （0行にはしない。以降の全ての検証より先に判定するため、未認可の主体へ引数の検証結果を
--     漏らさない）。
--   - draft・public の両方を、release_date（未来・過去・NULL）に関係なく返す
--     （public RPCとは異なり、公開範囲の述語は適用しない）。
--   - 返す列は5列のみ。cover_image_url・description・created_at は返さない（detailで取得する）。
--     updated_at は加工せずDBのtimestamptzをそのまま返す（後続の更新でのversion tokenに使う）。
--   - search: titleのみ（descriptionは検索しない）。get_admin_events() と同じ規則:
--     前後の空白（U+0020・tab・LF・CR・U+3000）をtrimし、空ならfilterなし。正規化後の長さは
--     最大100文字（超過はSONG_SEARCH_TOO_LONG）。大文字小文字を区別しない部分一致で、
--     % _ \ はwildcardではなく通常の文字として扱う。
--   - status_filter: NULL / 'draft' / 'public' の完全一致のみ（それ以外はINVALID_SONG_STATUS_FILTER）。
--   - 検証の順序: 認可 -> search -> status_filter -> cursor -> page_size。
--   - 並び順: release_date DESC NULLS LAST, id DESC（get_public_songs() と同じ。statusでgroupしない）。
--   - cursor（keyset）: cursorの有無は after_id IS NULL で判定する（get_public_songs() と同じ）。
--       after_id NULL かつ after_release_date NULL: 先頭ページ
--       after_id NULL かつ after_release_date 非NULL: INVALID_SONG_CURSOR
--       両方非NULL: release_dateありの区間のcursor
--       after_id 非NULL かつ after_release_date NULL: release_date NULLの区間のcursor
--     cursorが実在するsongか・どのstatusかは検証しない。
--   - filterは全てAND。page_size: NULLなら20、それ以外は1〜100へclamp。
--   - 件数（total_count）・詳細は提供しない。admin_logsには記録しない（read-only）。
--   - 不正なUUID文字列は、関数の本体に入る前にPostgreSQLの型変換エラー（22P02）になり得る。
--   - ページ間のsnapshotは保証しない（STABLE。row lockは取らない）。
--
-- SECURITY DEFINER（owner=postgres）/ STABLE / search_path=''。全参照はschema修飾。
--   dynamic SQLは使用しない。
-- ACL: PUBLIC / anon / service_role からEXECUTEを取り消し、authenticatedに付与する
--   （postgresはownerとしてEXECUTEを持つ）。
-- 001〜040は変更しない。
-- =============================================================================

create function public.get_admin_songs(
  search text default null,
  status_filter text default null,
  after_release_date date default null,
  after_id uuid default null,
  page_size integer default 20
)
returns table (
  id uuid,
  title text,
  release_date date,
  status text,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_search text;
  v_pattern text;
  v_page_size integer;
begin
  if not public.is_admin() then
    raise exception 'SONG_MANAGEMENT_NOT_AUTHORIZED';
  end if;

  v_search := nullif(
    btrim(get_admin_songs.search, chr(32) || chr(9) || chr(10) || chr(13) || chr(12288)),
    ''
  );
  if v_search is not null and char_length(v_search) > 100 then
    raise exception 'SONG_SEARCH_TOO_LONG';
  end if;

  if get_admin_songs.status_filter is not null
     and get_admin_songs.status_filter not in ('draft', 'public') then
    raise exception 'INVALID_SONG_STATUS_FILTER';
  end if;

  if get_admin_songs.after_id is null and get_admin_songs.after_release_date is not null then
    raise exception 'INVALID_SONG_CURSOR';
  end if;

  v_page_size := least(greatest(coalesce(get_admin_songs.page_size, 20), 1), 100);

  -- LIKEのwildcard（% _）とescape文字（\）を通常の文字として扱う。
  if v_search is not null then
    v_pattern := '%' || replace(replace(replace(v_search, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;

  return query
    select
      s.id,
      s.title,
      s.release_date,
      s.status,
      s.updated_at
    from public.songs as s
    where (get_admin_songs.status_filter is null or s.status = get_admin_songs.status_filter)
      and (
        v_search is null
        or s.title ilike v_pattern escape '\'
      )
      and (
        get_admin_songs.after_id is null
        or (
          get_admin_songs.after_release_date is not null
          and (
            s.release_date < get_admin_songs.after_release_date
            or (
              s.release_date = get_admin_songs.after_release_date
              and s.id < get_admin_songs.after_id
            )
            or s.release_date is null
          )
        )
        or (
          get_admin_songs.after_release_date is null
          and s.release_date is null
          and s.id < get_admin_songs.after_id
        )
      )
    order by s.release_date desc nulls last, s.id desc
    limit v_page_size;
end;
$$;

alter function public.get_admin_songs(text, text, date, uuid, integer) owner to postgres;

revoke execute on function public.get_admin_songs(text, text, date, uuid, integer) from public;
revoke execute on function public.get_admin_songs(text, text, date, uuid, integer) from anon;
revoke execute on function public.get_admin_songs(text, text, date, uuid, integer) from service_role;
grant execute on function public.get_admin_songs(text, text, date, uuid, integer) to authenticated;
