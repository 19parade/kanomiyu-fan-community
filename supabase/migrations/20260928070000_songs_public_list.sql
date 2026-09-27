-- =============================================================================
-- 20260928070000_songs_public_list.sql
-- songs の公開一覧 (S2): public.get_public_songs()
--
-- 対象: public.get_public_songs() の作成とEXECUTE ACLのみ。songs のtable・列・制約・index・
--   trigger・RLS・policy・ACL、他のfunction・table・default privilegeは変更しない。
--   songsのbase tableは引き続きクライアントから全拒否（RPC経由のみpublic read可）。
--   詳細のRPC・admin read/write・Storage・検索・件数は追加しない。
--
-- get_public_songs(after_release_date, after_id, page_size)
--   -> TABLE (id uuid, title text, release_date date, cover_image_url text)
--   - anon・authenticated（active / suspended / banned / profileなしを含む）の全員が実行でき、
--     アカウントの状態・blockに依存しない（is_active_user() / is_admin() /
--     is_community_browsing_allowed() / is_blocked_with() は呼ばない）。adminも通常の
--     public閲覧者と同じ（draftは見えない）。
--   - 返す行は status = 'public' のみ（SECURITY DEFINER でRLSをbypassするため、RPC内で
--     明示する）。release_date は公開可否に使わない（未来・過去・NULLのいずれも公開できる）。
--     status（公開状態）が変わる場合は、このRPCも再評価する。
--   - 返す列は4列のみ。description・status・created_at・updated_at は返さない。
--     cover_image_url はStorageのobject key（DBの値をそのまま返す）。
--   - 並び順: release_date DESC NULLS LAST, id DESC。
--   - cursor（keyset）: cursorの有無は after_id IS NULL で判定する。
--       after_id NULL かつ after_release_date NULL: 先頭ページ
--       after_id NULL かつ after_release_date 非NULL: INVALID_SONG_CURSOR
--       after_id 非NULL かつ after_release_date 非NULL: release_dateありの区間のcursor
--         （release_date < D、または release_date = D かつ id < I、または release_date IS NULL）
--       after_id 非NULL かつ after_release_date NULL: release_date NULLの区間のcursor
--         （release_date IS NULL かつ id < I。non-NULLの区間へは戻らない）
--     cursorが実在するsongか・publicかは検証しない（並び順の境界として比較するだけ）。
--   - page_size: NULLなら20、それ以外は1〜100へclamp。
--   - 不正なUUID文字列は、関数の本体に入る前にPostgreSQLの型変換エラー（22P02）になり得る。
--   - ページ間のsnapshotは保証しない（STABLE。row lockは取らない）。
--
-- SECURITY DEFINER（owner=postgres）/ STABLE / search_path=''。全参照はschema修飾。
--   dynamic SQLは使用しない。
-- ACL: PUBLIC / service_role からEXECUTEを取り消し、anon・authenticatedに付与する
--   （postgresはownerとしてEXECUTEを持つ）。
-- 001〜038は変更しない。
-- =============================================================================

create function public.get_public_songs(
  after_release_date date default null,
  after_id uuid default null,
  page_size integer default 20
)
returns table (
  id uuid,
  title text,
  release_date date,
  cover_image_url text
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
      s.cover_image_url
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
