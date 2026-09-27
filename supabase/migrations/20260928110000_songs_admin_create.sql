-- =============================================================================
-- 20260928110000_songs_admin_create.sql
-- songs のadmin作成 (S5): internal.normalize_song_content() / public.create_song()
--
-- 対象: internal.normalize_song_content() と public.create_song() の作成、および
--   その所有者・EXECUTE ACLのみ。songs のtable・列・制約・index・trigger・RLS・policy・ACL、
--   admin_logs、既存のfunction・table・default privilegeは変更しない。songsのbase table
--   は引き続きクライアントから全拒否（作成はこのSECURITY DEFINER RPC経由のみ）。
--   update・status変更・DELETE・Storageは追加しない。
--
-- internal.normalize_song_content(p_title, p_description, p_cover_image_url, p_release_date)
--   -> TABLE (title, description, cover_image_url, release_date)
--   create_song（および今後のupdate_song）で共有する正規化・検証のhelper。認可・status・
--   song検索・admin_logs・同時実行・Storage確認は担当しない。owner=postgres・SECURITY INVOKER・
--   IMMUTABLE・search_path=''、EXECUTEはpostgresのみ（アプリケーションのRPCではない）。
--   trimする文字は U+0020・tab・LF・CR・U+3000 のみ（get_admin_songs / events のhelperと同じ）。
--   検証の順序（複数が不正な場合は最初の項目のエラー）: title -> description ->
--   cover_image_url -> release_date。
--   - title: NULL・trim後に空・trim後101文字以上は INVALID_SONG_TITLE（1〜100文字）。
--     内部の空白・改行・Unicodeは保持し、Unicodeの正規化はしない。
--   - description: NULLまたはtrim後に空ならNULL。trim後5000文字超は INVALID_SONG_DESCRIPTION。
--     内部の空白・改行・HTML風の文字列は保持する（plain textとして扱い、歌詞の判定はしない）。
--   - cover_image_url: NULLまたはtrim後に空ならNULL。それ以外は Storage の song-images bucket の
--     object key `{uuid}.{ext}`（uuidは8-4-4-4-12のhex。ファイル固有のUUIDで、songのidとは無関係。
--     大文字小文字は区別せずhexとして受理し、変換しない。extはlowercaseの jpg / jpeg / png /
--     webp のみ）に完全一致しなければ INVALID_SONG_COVER_IMAGE_KEY。大文字の拡張子は
--     受理して変換せず拒否する（Storageのobject keyは大文字小文字を区別するため、DBで別のkeyへ
--     黙って変換しない。events用のhelperとは意図的に異なる）。objectの実在は確認しない。
--   - release_date: NULL可。有限のdateは過去・今日・未来のいずれも有効（statusとは独立）。
--     infinity / -infinity は INVALID_SONG_RELEASE_DATE。
--
-- public.create_song(title, release_date, cover_image_url, description) -> uuid
--   - public.is_admin()（active adminのみ）でなければ SONG_MANAGEMENT_NOT_AUTHORIZED
--     （helperの検証より先に判定するため、未認可の主体へ検証結果を漏らさない）。
--   - 常に status = 'draft' で作成する（status引数はない。公開はS7で行う）。id・created_at・
--     updated_at はDBが生成する。created_by は持たない。同名の曲も作成できる。
--   - songs のINSERTと admin_logs のINSERT（action='create_song'、target_type='song'、
--     target_id=新しいsongのid、detail={"to_status":"draft"}。内容の値は記録しない）は
--     同一transactionで、audit失敗時はsongの作成もrollbackされる。
--   - 戻り値は新しいsongのidのみ（作成後は get_admin_song() で再取得する）。
--   - owner=postgres・SECURITY DEFINER・VOLATILE・search_path=''、EXECUTEはauthenticatedと
--     postgresのみ（PUBLIC・anon・service_roleは不可）。dynamic SQLは使用しない。
-- 001〜042は変更しない。
-- =============================================================================

create function internal.normalize_song_content(
  p_title text,
  p_description text,
  p_cover_image_url text,
  p_release_date date
)
returns table (
  title text,
  description text,
  cover_image_url text,
  release_date date
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

  return query select v_title, v_description, v_cover, p_release_date;
end;
$$;

alter function internal.normalize_song_content(text, text, text, date) owner to postgres;

revoke execute on function internal.normalize_song_content(text, text, text, date) from public;
revoke execute on function internal.normalize_song_content(text, text, text, date) from anon;
revoke execute on function internal.normalize_song_content(text, text, text, date) from authenticated;
revoke execute on function internal.normalize_song_content(text, text, text, date) from service_role;

create function public.create_song(
  title text,
  release_date date default null,
  cover_image_url text default null,
  description text default null
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
      create_song.release_date
    );

  insert into public.songs (title, release_date, cover_image_url, description, status)
  values (
    v_norm.title,
    v_norm.release_date,
    v_norm.cover_image_url,
    v_norm.description,
    'draft'
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

alter function public.create_song(text, date, text, text) owner to postgres;

revoke execute on function public.create_song(text, date, text, text) from public;
revoke execute on function public.create_song(text, date, text, text) from anon;
revoke execute on function public.create_song(text, date, text, text) from service_role;
grant execute on function public.create_song(text, date, text, text) to authenticated;
