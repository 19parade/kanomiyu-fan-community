-- =============================================================================
-- 20260928080000_songs_public_detail.sql
-- songs の公開詳細 (S3): public.get_public_song()
--
-- 対象: public.get_public_song() の作成とEXECUTE ACLのみ。songs のtable・列・制約・index・
--   trigger・RLS・policy・ACL、get_public_songs()（S2）、他のfunction・table・
--   default privilegeは変更しない。songsのbase tableは引き続きクライアントから全拒否
--   （RPC経由のみpublic read可）。admin read/write・Storage・検索・件数は追加しない。
--
-- get_public_song(target_song_id)
--   -> TABLE (id uuid, title text, release_date date, cover_image_url text, description text)
--   - anon・authenticated（active / suspended / banned / profileなしを含む）の全員が実行でき、
--     アカウントの状態・blockに依存しない（is_active_user() / is_admin() /
--     is_community_browsing_allowed() / is_blocked_with() は呼ばない）。adminも通常の
--     public閲覧者と同じ（draftは見えない）。
--   - 返す行は id = target_song_id かつ status = 'public' のみ（SECURITY DEFINER でRLSを
--     bypassするため、RPC内で明示する）。release_date は公開可否に使わない。
--     存在するdraft・不存在・NULLのIDは、区別できない同じ0行（エラーにしない）。
--   - 返す列は5列のみ。status・created_at・updated_at は返さない。description は
--     DBの値をそのまま返す（NULLも可。歌詞全文を許可する意味ではない）。cover_image_url は
--     Storageのobject key（DBの値をそのまま返す）。
--   - 不正なUUID文字列は、関数の本体に入る前にPostgreSQLの型変換エラー（22P02）になり得る。
--   - songsの公開状態（status）の意味を変更する場合は、get_public_songs()とこのRPCの
--     両方を再評価する。
--
-- SECURITY DEFINER（owner=postgres）/ STABLE / search_path=''。全参照はschema修飾。
--   dynamic SQL・row lockは使用しない。
-- ACL: PUBLIC / service_role からEXECUTEを取り消し、anon・authenticatedに付与する
--   （postgresはownerとしてEXECUTEを持つ）。
-- 001〜039は変更しない。
-- =============================================================================

create function public.get_public_song(
  target_song_id uuid
)
returns table (
  id uuid,
  title text,
  release_date date,
  cover_image_url text,
  description text
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
    s.description
  from public.songs as s
  where s.id = get_public_song.target_song_id
    and s.status = 'public';
$$;

alter function public.get_public_song(uuid) owner to postgres;

revoke execute on function public.get_public_song(uuid) from public;
revoke execute on function public.get_public_song(uuid) from service_role;
grant execute on function public.get_public_song(uuid) to anon;
grant execute on function public.get_public_song(uuid) to authenticated;
