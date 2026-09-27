-- =============================================================================
-- 20260928100000_songs_admin_detail.sql
-- songs のadmin詳細 (S4b): public.get_admin_song()
--
-- 対象: public.get_admin_song() の作成とEXECUTE ACLのみ。songs のtable・列・制約・index・
--   trigger・RLS・policy・ACL、get_public_songs() / get_public_song() / get_admin_songs()
--   （S2・S3・S4a）、他のfunction・table・default privilegeは変更しない。songsのbase table
--   は引き続きクライアントから全拒否（admin詳細もこのSECURITY DEFINER RPC経由のみ）。
--   create・update・status変更・DELETE・Storageは追加しない。
--
-- get_admin_song(target_song_id)
--   -> TABLE (id uuid, title text, release_date date, cover_image_url text, description text,
--             status text, created_at timestamptz, updated_at timestamptz)
--   - public.is_admin()（active adminのみ）でなければ SONG_MANAGEMENT_NOT_AUTHORIZED
--     （対象の検索より先に判定するため、未認可の主体へsongの存在を漏らさない）。
--   - 対象は id = target_song_id の1行（draft・public のどちらも、release_date に関係なく
--     返す）。不存在・NULLのIDは、エラーにせず0行（public RPCとは異なり、draftは返る）。
--   - 返す列は現在のsongsの8列を明示して列挙する（SELECT * は使わない。将来列が追加されても
--     自動では返さない）。NULLの列はNULLのまま返し、created_at・updated_at はDBの
--     timestamptzを加工せずそのまま返す（updated_at は後続の更新でのversion tokenに使う）。
--     cover_image_url はStorageのobject key（DBの値そのまま）。descriptionの内容は検証・加工しない。
--   - 不正なUUID文字列は、関数の本体に入る前にPostgreSQLの型変換エラー（22P02）になり得る。
--   - admin_logsには記録しない（read-only）。row lockは取らない。
--
-- SECURITY DEFINER（owner=postgres）/ STABLE / search_path=''。全参照はschema修飾。
--   dynamic SQLは使用しない。
-- ACL: PUBLIC / anon / service_role からEXECUTEを取り消し、authenticatedに付与する
--   （postgresはownerとしてEXECUTEを持つ）。
-- 001〜041は変更しない。
-- =============================================================================

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
  updated_at timestamptz
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
      s.updated_at
    from public.songs as s
    where s.id = get_admin_song.target_song_id;
end;
$$;

alter function public.get_admin_song(uuid) owner to postgres;

revoke execute on function public.get_admin_song(uuid) from public;
revoke execute on function public.get_admin_song(uuid) from anon;
revoke execute on function public.get_admin_song(uuid) from service_role;
grant execute on function public.get_admin_song(uuid) to authenticated;
