-- =============================================================================
-- 20261123000000_songs_streaming_links.sql
-- songs に主要音楽配信サービスへのリンク4項目を追加する（PM依頼 2026-11-23）
--
-- PM判断（2026-11-23付、/music一覧・詳細ページへのリンク設置依頼）:
--   対象サービスはSpotify・Apple Music・YouTube Music・LINE MUSICの4つ。
--
-- 対象（本migrationに含まれるもの）:
--   A. public.songs に spotify_url・apple_music_url・youtube_music_url・
--      line_music_url（いずれもtext、nullable）の4列を追加する
--   B. internal.normalize_song_content() を、上記4項目を含むシグネチャへ
--      置き換える（DROP FUNCTION + CREATE FUNCTION。既存4項目（title /
--      description / cover_image_url / release_date）の検証規則は一切
--      変更しない。新規4項目の検証のみ追加する）
--   C. public.create_song() を、上記4項目を受け取れるシグネチャへ置き換える
--      （DROP FUNCTION + CREATE FUNCTION。既存の「常にdraftで作成」契約は
--      変更しない）
--   D. public.update_song() を、上記4項目を受け取れるシグネチャへ置き換える
--      （DROP FUNCTION + CREATE FUNCTION。既存の全置換・楽観的同時実行
--      制御・no-op判定の方針は変更しない）
--   E. public.get_admin_song() を、上記4項目を返すシグネチャへ置き換える
--      （管理画面の編集フォームが現在値を表示できるようにするため）
--   F. public.get_public_song() を、上記4項目を返すシグネチャへ置き換える
--      （/music/[id] 詳細ページ用）
--   G. public.get_public_songs() を、上記4項目を返すシグネチャへ置き換える
--      （/music 一覧ページでも各曲下部にアイコンリンクを表示するため —
--      詳細ページだけでなく一覧ページ自体がPM依頼の対象であるため、
--      一覧RPCも widen する）
--
-- 対象に含まれないもの（変更しない）:
--   - get_admin_songs()（S4a。一覧テーブルは引き続きtitle/release_date/
--     status/updated_atのみを表示するため、この4項目は表示に使わない）
--   - set_song_status()（S7。status遷移とは無関係）
--   - songsのRLS・ACL（既存方針どおりbase tableへのクライアント直接
--     アクセスは引き続き全拒否のまま。読み書きはすべてこれらのRPC経由のみ）
--   - song-images Storage・admin_logsの記録形式（変更なし）
--
-- -----------------------------------------------------------------------------
-- A. 列追加
-- -----------------------------------------------------------------------------
alter table public.songs
  add column spotify_url text,
  add column apple_music_url text,
  add column youtube_music_url text,
  add column line_music_url text;


-- -----------------------------------------------------------------------------
-- B. internal.normalize_song_content() の置き換え
--
-- 新規4項目はいずれもnullable。trim後に空ならNULL。非NULLの場合は
-- events の official_url/ticket_url と同じ形式検証（https://のみ、host
-- 必須、userinfo禁止、空白・制御文字禁止、最大2048文字）を適用する
-- （規則を複製するが、ticket_url/official_url自体のロジックは変更しない）。
-- 特定ドメイン（open.spotify.com等）への限定は行わない — 既存の
-- ticket_url/official_urlも同様にドメインを限定していないため、一貫性を
-- 優先する。違反はそれぞれ INVALID_SONG_SPOTIFY_URL /
-- INVALID_SONG_APPLE_MUSIC_URL / INVALID_SONG_YOUTUBE_MUSIC_URL /
-- INVALID_SONG_LINE_MUSIC_URL。
--
-- 判定順序: 既存の title -> description -> cover_image_url -> release_date
-- の後に、spotify_url -> apple_music_url -> youtube_music_url ->
-- line_music_url の順で追加検証する（既存4項目の判定順序・エラーの
-- 優先順位は変更しない）。
-- -----------------------------------------------------------------------------
drop function internal.normalize_song_content(text, text, text, date);

create function internal.normalize_song_content(
  p_title text,
  p_description text,
  p_cover_image_url text,
  p_release_date date,
  p_spotify_url text,
  p_apple_music_url text,
  p_youtube_music_url text,
  p_line_music_url text
)
returns table (
  title text,
  description text,
  cover_image_url text,
  release_date date,
  spotify_url text,
  apple_music_url text,
  youtube_music_url text,
  line_music_url text
)
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_ws constant text := chr(32) || chr(9) || chr(10) || chr(13) || chr(12288);
  v_title text;
  v_description text;
  v_cover text;
  v_spotify text;
  v_apple_music text;
  v_youtube_music text;
  v_line_music text;
begin
  v_title := btrim(p_title, v_ws);
  if v_title is null or char_length(v_title) < 1 or char_length(v_title) > 100 then
    raise exception 'INVALID_SONG_TITLE';
  end if;

  v_description := nullif(btrim(p_description, v_ws), '');
  if v_description is not null and char_length(v_description) > 5000 then
    raise exception 'INVALID_SONG_DESCRIPTION';
  end if;

  v_cover := nullif(btrim(p_cover_image_url, v_ws), '');
  if v_cover is not null
     and v_cover !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\.(jpg|jpeg|png|webp)$' then
    raise exception 'INVALID_SONG_COVER_IMAGE_KEY';
  end if;

  if p_release_date is not null and not isfinite(p_release_date) then
    raise exception 'INVALID_SONG_RELEASE_DATE';
  end if;

  -- 以下4項目は、events のticket_url/official_urlと同じ形式検証
  -- （https://のみ・host必須・userinfo禁止・空白/制御文字禁止・最大2048
  -- 文字）を、dynamic SQLを使わずそれぞれ個別に（複製して）適用する —
  -- このmigrationの冒頭コメントで述べた通り、特定ドメインへの限定はしない。
  v_spotify := nullif(btrim(p_spotify_url, v_ws), '');
  if v_spotify is not null then
    if char_length(v_spotify) > 2048
       or v_spotify !~ '^https://[^[:space:]/?#@:.][^[:space:]/?#@]*([/?#][^[:space:]]*)?$'
       or v_spotify ~ '[[:cntrl:]]'
       or position(chr(12288) in v_spotify) > 0 then
      raise exception 'INVALID_SONG_SPOTIFY_URL';
    end if;
  end if;

  v_apple_music := nullif(btrim(p_apple_music_url, v_ws), '');
  if v_apple_music is not null then
    if char_length(v_apple_music) > 2048
       or v_apple_music !~ '^https://[^[:space:]/?#@:.][^[:space:]/?#@]*([/?#][^[:space:]]*)?$'
       or v_apple_music ~ '[[:cntrl:]]'
       or position(chr(12288) in v_apple_music) > 0 then
      raise exception 'INVALID_SONG_APPLE_MUSIC_URL';
    end if;
  end if;

  v_youtube_music := nullif(btrim(p_youtube_music_url, v_ws), '');
  if v_youtube_music is not null then
    if char_length(v_youtube_music) > 2048
       or v_youtube_music !~ '^https://[^[:space:]/?#@:.][^[:space:]/?#@]*([/?#][^[:space:]]*)?$'
       or v_youtube_music ~ '[[:cntrl:]]'
       or position(chr(12288) in v_youtube_music) > 0 then
      raise exception 'INVALID_SONG_YOUTUBE_MUSIC_URL';
    end if;
  end if;

  v_line_music := nullif(btrim(p_line_music_url, v_ws), '');
  if v_line_music is not null then
    if char_length(v_line_music) > 2048
       or v_line_music !~ '^https://[^[:space:]/?#@:.][^[:space:]/?#@]*([/?#][^[:space:]]*)?$'
       or v_line_music ~ '[[:cntrl:]]'
       or position(chr(12288) in v_line_music) > 0 then
      raise exception 'INVALID_SONG_LINE_MUSIC_URL';
    end if;
  end if;

  return query select
    v_title, v_description, v_cover, p_release_date,
    v_spotify, v_apple_music, v_youtube_music, v_line_music;
end;
$$;

alter function internal.normalize_song_content(text, text, text, date, text, text, text, text) owner to postgres;

revoke execute on function internal.normalize_song_content(text, text, text, date, text, text, text, text) from public;
revoke execute on function internal.normalize_song_content(text, text, text, date, text, text, text, text) from anon;
revoke execute on function internal.normalize_song_content(text, text, text, date, text, text, text, text) from authenticated;
revoke execute on function internal.normalize_song_content(text, text, text, date, text, text, text, text) from service_role;


-- -----------------------------------------------------------------------------
-- C. public.create_song() の置き換え
--
-- 既存4項目の意味・サーバー管理項目（id/status/created_at/updated_at）の
-- 扱いは一切変更しない。新規4項目をDEFAULT NULLの末尾引数として追加する
-- （既存の呼び出し規約を壊さない）。
-- -----------------------------------------------------------------------------
drop function public.create_song(text, date, text, text);

create function public.create_song(
  title text,
  release_date date default null,
  cover_image_url text default null,
  description text default null,
  spotify_url text default null,
  apple_music_url text default null,
  youtube_music_url text default null,
  line_music_url text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin_id uuid := auth.uid();
  v_norm record;
  v_song_id uuid;
begin
  if not public.is_admin() then
    raise exception 'SONG_MANAGEMENT_NOT_AUTHORIZED';
  end if;

  select *
    into v_norm
    from internal.normalize_song_content(
      create_song.title,
      create_song.description,
      create_song.cover_image_url,
      create_song.release_date,
      create_song.spotify_url,
      create_song.apple_music_url,
      create_song.youtube_music_url,
      create_song.line_music_url
    );

  insert into public.songs (
    title, release_date, cover_image_url, description, status,
    spotify_url, apple_music_url, youtube_music_url, line_music_url
  )
  values (
    v_norm.title,
    v_norm.release_date,
    v_norm.cover_image_url,
    v_norm.description,
    'draft',
    v_norm.spotify_url,
    v_norm.apple_music_url,
    v_norm.youtube_music_url,
    v_norm.line_music_url
  )
  returning id into v_song_id;

  insert into public.admin_logs (admin_id, action, target_type, target_id, detail)
  values (
    v_admin_id,
    'create_song',
    'song',
    v_song_id,
    jsonb_build_object('to_status', 'draft')
  );

  return v_song_id;
end;
$$;

alter function public.create_song(text, date, text, text, text, text, text, text) owner to postgres;

revoke execute on function public.create_song(text, date, text, text, text, text, text, text) from public;
revoke execute on function public.create_song(text, date, text, text, text, text, text, text) from anon;
revoke execute on function public.create_song(text, date, text, text, text, text, text, text) from service_role;
grant execute on function public.create_song(text, date, text, text, text, text, text, text) to authenticated;


-- -----------------------------------------------------------------------------
-- D. public.update_song() の置き換え
--
-- 既存の全置換・楽観的同時実行制御（expected_updated_at完全一致）・
-- no-op判定・admin_logsのchanged_fields記録方式は変更しない。新規4項目も
-- 既存4項目と同じ「全置換・NULLはクリアを意味する」方針に従う（DEFAULT
-- NULLの末尾引数とする）。changed_fieldsの固定順序に、spotify_url ->
-- apple_music_url -> youtube_music_url -> line_music_url を既存4項目の
-- 後ろに追加する。
-- -----------------------------------------------------------------------------
drop function public.update_song(uuid, timestamptz, text, date, text, text);

create function public.update_song(
  target_song_id uuid,
  expected_updated_at timestamptz,
  title text,
  release_date date default null,
  cover_image_url text default null,
  description text default null,
  spotify_url text default null,
  apple_music_url text default null,
  youtube_music_url text default null,
  line_music_url text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin_id uuid := auth.uid();
  v_norm record;
  v_cur public.songs%rowtype;
  v_changed text[] := array[]::text[];
begin
  if not public.is_admin() then
    raise exception 'SONG_MANAGEMENT_NOT_AUTHORIZED';
  end if;

  if update_song.expected_updated_at is null then
    raise exception 'INVALID_SONG_VERSION';
  end if;

  select *
    into v_norm
    from internal.normalize_song_content(
      update_song.title,
      update_song.description,
      update_song.cover_image_url,
      update_song.release_date,
      update_song.spotify_url,
      update_song.apple_music_url,
      update_song.youtube_music_url,
      update_song.line_music_url
    );

  select s.*
    into v_cur
    from public.songs as s
    where s.id = update_song.target_song_id
    for update;

  if not found then
    raise exception 'SONG_NOT_FOUND';
  end if;

  if v_cur.updated_at is distinct from update_song.expected_updated_at then
    raise exception 'SONG_VERSION_CONFLICT';
  end if;

  if v_cur.title is distinct from v_norm.title then
    v_changed := array_append(v_changed, 'title');
  end if;
  if v_cur.release_date is distinct from v_norm.release_date then
    v_changed := array_append(v_changed, 'release_date');
  end if;
  if v_cur.cover_image_url is distinct from v_norm.cover_image_url then
    v_changed := array_append(v_changed, 'cover_image_url');
  end if;
  if v_cur.description is distinct from v_norm.description then
    v_changed := array_append(v_changed, 'description');
  end if;
  if v_cur.spotify_url is distinct from v_norm.spotify_url then
    v_changed := array_append(v_changed, 'spotify_url');
  end if;
  if v_cur.apple_music_url is distinct from v_norm.apple_music_url then
    v_changed := array_append(v_changed, 'apple_music_url');
  end if;
  if v_cur.youtube_music_url is distinct from v_norm.youtube_music_url then
    v_changed := array_append(v_changed, 'youtube_music_url');
  end if;
  if v_cur.line_music_url is distinct from v_norm.line_music_url then
    v_changed := array_append(v_changed, 'line_music_url');
  end if;

  if cardinality(v_changed) = 0 then
    return false;
  end if;

  update public.songs
    set title = v_norm.title,
        release_date = v_norm.release_date,
        cover_image_url = v_norm.cover_image_url,
        description = v_norm.description,
        spotify_url = v_norm.spotify_url,
        apple_music_url = v_norm.apple_music_url,
        youtube_music_url = v_norm.youtube_music_url,
        line_music_url = v_norm.line_music_url
    where id = update_song.target_song_id;

  insert into public.admin_logs (admin_id, action, target_type, target_id, detail)
  values (
    v_admin_id,
    'update_song',
    'song',
    update_song.target_song_id,
    jsonb_build_object('changed_fields', to_jsonb(v_changed))
  );

  return true;
end;
$$;

alter function public.update_song(uuid, timestamptz, text, date, text, text, text, text, text, text) owner to postgres;

revoke execute on function public.update_song(uuid, timestamptz, text, date, text, text, text, text, text, text) from public;
revoke execute on function public.update_song(uuid, timestamptz, text, date, text, text, text, text, text, text) from anon;
revoke execute on function public.update_song(uuid, timestamptz, text, date, text, text, text, text, text, text) from service_role;
grant execute on function public.update_song(uuid, timestamptz, text, date, text, text, text, text, text, text) to authenticated;


-- -----------------------------------------------------------------------------
-- E. public.get_admin_song() の置き換え（8列 -> 12列）
-- -----------------------------------------------------------------------------
drop function public.get_admin_song(uuid);

create function public.get_admin_song(
  target_song_id uuid
)
returns table (
  id uuid,
  title text,
  release_date date,
  cover_image_url text,
  description text,
  status text,
  created_at timestamptz,
  updated_at timestamptz,
  spotify_url text,
  apple_music_url text,
  youtube_music_url text,
  line_music_url text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'SONG_MANAGEMENT_NOT_AUTHORIZED';
  end if;

  return query
    select
      s.id,
      s.title,
      s.release_date,
      s.cover_image_url,
      s.description,
      s.status,
      s.created_at,
      s.updated_at,
      s.spotify_url,
      s.apple_music_url,
      s.youtube_music_url,
      s.line_music_url
    from public.songs as s
    where s.id = get_admin_song.target_song_id;
end;
$$;

alter function public.get_admin_song(uuid) owner to postgres;

revoke execute on function public.get_admin_song(uuid) from public;
revoke execute on function public.get_admin_song(uuid) from anon;
revoke execute on function public.get_admin_song(uuid) from service_role;
grant execute on function public.get_admin_song(uuid) to authenticated;


-- -----------------------------------------------------------------------------
-- F. public.get_public_song() の置き換え（5列 -> 9列）
-- -----------------------------------------------------------------------------
drop function public.get_public_song(uuid);

create function public.get_public_song(
  target_song_id uuid
)
returns table (
  id uuid,
  title text,
  release_date date,
  cover_image_url text,
  description text,
  spotify_url text,
  apple_music_url text,
  youtube_music_url text,
  line_music_url text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    s.id,
    s.title,
    s.release_date,
    s.cover_image_url,
    s.description,
    s.spotify_url,
    s.apple_music_url,
    s.youtube_music_url,
    s.line_music_url
  from public.songs as s
  where s.id = get_public_song.target_song_id
    and s.status = 'public';
$$;

alter function public.get_public_song(uuid) owner to postgres;

revoke execute on function public.get_public_song(uuid) from public;
revoke execute on function public.get_public_song(uuid) from service_role;
grant execute on function public.get_public_song(uuid) to anon;
grant execute on function public.get_public_song(uuid) to authenticated;


-- -----------------------------------------------------------------------------
-- G. public.get_public_songs() の置き換え（4列 -> 8列）
--
-- /music 一覧ページ自体がPM依頼の対象（「楽曲一覧のページの各楽曲の下部に
-- ...設置する」）のため、詳細RPCだけでなく一覧RPCも widen する。並び順・
-- cursor・page_sizeの仕様は一切変更しない。
-- -----------------------------------------------------------------------------
drop function public.get_public_songs(date, uuid, integer);

create function public.get_public_songs(
  after_release_date date default null,
  after_id uuid default null,
  page_size integer default 20
)
returns table (
  id uuid,
  title text,
  release_date date,
  cover_image_url text,
  spotify_url text,
  apple_music_url text,
  youtube_music_url text,
  line_music_url text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_page_size int;
begin
  if get_public_songs.after_id is null and get_public_songs.after_release_date is not null then
    raise exception 'INVALID_SONG_CURSOR';
  end if;

  v_page_size := least(greatest(coalesce(get_public_songs.page_size, 20), 1), 100);

  return query
    select
      s.id,
      s.title,
      s.release_date,
      s.cover_image_url,
      s.spotify_url,
      s.apple_music_url,
      s.youtube_music_url,
      s.line_music_url
    from public.songs as s
    where s.status = 'public'
      and (
        get_public_songs.after_id is null
        or (
          get_public_songs.after_release_date is not null
          and (
            s.release_date < get_public_songs.after_release_date
            or (
              s.release_date = get_public_songs.after_release_date
              and s.id < get_public_songs.after_id
            )
            or s.release_date is null
          )
        )
        or (
          get_public_songs.after_release_date is null
          and s.release_date is null
          and s.id < get_public_songs.after_id
        )
      )
    order by s.release_date desc nulls last, s.id desc
    limit v_page_size;
end;
$$;

alter function public.get_public_songs(date, uuid, integer) owner to postgres;

revoke execute on function public.get_public_songs(date, uuid, integer) from public;
revoke execute on function public.get_public_songs(date, uuid, integer) from service_role;
grant execute on function public.get_public_songs(date, uuid, integer) to anon;
grant execute on function public.get_public_songs(date, uuid, integer) to authenticated;
