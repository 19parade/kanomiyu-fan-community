-- =============================================================================
-- 20260928150000_song_images_policies.sql
-- Storage `song-images` のwrite boundary (ST2改訂版): key検証helper・delete可否helper・
--   storage.objects のSELECT / INSERT / DELETE policy
--
-- 対象: internal.is_valid_song_image_key() / internal.can_delete_song_image() の作成と、
--   storage.objects への song-images 専用のpolicy 3件（SELECT・INSERT・DELETE）のみ。
--   song-images の bucket（ST1）、songs のtable・列・制約・RLS・ACL、Songsのfunction、
--   admin_logs、他のbucket、Storageのfunction・trigger（storage.protect_delete等）は
--   変更しない。UPDATE policyは作らない（overwrite不可。差し替えは新しいkeyで行う）。
--
-- 改訂の経緯: 当初はSELECT policyを作らない設計を検討したが、実測で
--   「song_images_admin_deleteのUSINGのみでは、SELECT policyが0件の状態だとDELETE対象行が
--   RLS上visibleにならず、DELETEが実際には0行に終わる」ことを確認した（PostgreSQLのRLSは
--   UPDATE/DELETEの対象行の確定にSELECTの可視性が関与するため）。したがって、DELETEを
--   実際に機能させる前提として、active admin専用のSELECT policyを追加する（一般公開の
--   metadata公開ではない。公開されるのはbucketがpublicであることによる画像bytesの配信のみで、
--   storage.objectsのmetadataの一覧はactive adminのみ）。
--
-- internal.is_valid_song_image_key(object_name) -> boolean
--   Songsのcover_image_urlのobject key契約と同じ形式の検証のみ（bucket・認可・songsの参照・
--   Storageのobjectの実在・MIME・sizeは担当しない）。root直下の `{uuid}.{ext}`（uuidは8-4-4-4-12の
--   hex。大文字小文字は受理。extはlowercaseの jpg / jpeg / png / webp のみ）に完全一致する場合のみtrue。
--   NULL・blank・folder付き・URL・trimが必要な値・大文字の拡張子・その他の拡張子はfalse
--   （trimして受理しない）。SECURITY INVOKER・IMMUTABLE・search_path=''。
--
-- internal.can_delete_song_image(object_name) -> boolean
--   呼び出し元がactive admin（public.is_admin()）かつ object_name が有効なkeyかつ
--   public.songs.cover_image_url（draft・publicのどちらでも）から参照されていない場合のみtrue。
--   それ以外はfalse（例外は出さない。非adminへは参照の有無を漏らさない）。songsのbase tableを
--   authenticatedは直接読めないため SECURITY DEFINER（owner=postgres・STABLE・search_path=''）。
--   objectの実在は確認しない。EXECUTEはpostgresとauthenticatedのみ。
--
-- policy（roleはauthenticatedのみ。bucket_id = 'song-images' に限定し、他のbucketへ影響しない）:
--   song_images_admin_select: USING (bucket_id = 'song-images' AND public.is_admin())
--     — storage.objectsのmetadataの一覧。DELETEの前提。anon/一般ユーザーには公開しない
--     （画像bytesの配信はbucketのpublic属性による別経路）。
--   song_images_admin_insert: WITH CHECK (bucket_id = 'song-images' AND public.is_admin() AND
--     internal.is_valid_song_image_key(name))
--   song_images_admin_delete: USING (bucket_id = 'song-images' AND
--     internal.can_delete_song_image(name))
--   UPDATE policyがないため、同じkeyへのoverwrite（upsert）はできない（差し替えは新しいkey）。
--
-- 注意: can_delete_song_image() の参照確認と、Storage APIによる実際のDELETEの間には
--   TOCTOU raceが残る（別のadminが同時にそのkeyをsongへ設定し得る）。最終的な削除順序は
--   server側のorchestrationで制御する（ST3/ST4）。SQLから storage.objects を直接DELETEすることは
--   storage.protect_delete により引き続き禁止される（実削除はStorage API経由）。
-- public bucket（画像bytesはURL/keyを知る第三者が閲覧できる。draftも例外ではない）の方針は
--   このmigrationで変更しない。
-- 001〜046は変更しない。
-- =============================================================================

create function internal.is_valid_song_image_key(object_name text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    object_name ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\.(jpg|jpeg|png|webp)$',
    false
  );
$$;

alter function internal.is_valid_song_image_key(text) owner to postgres;

revoke execute on function internal.is_valid_song_image_key(text) from public;
revoke execute on function internal.is_valid_song_image_key(text) from anon;
revoke execute on function internal.is_valid_song_image_key(text) from service_role;
grant execute on function internal.is_valid_song_image_key(text) to authenticated;

create function internal.can_delete_song_image(object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    public.is_admin()
    and internal.is_valid_song_image_key(can_delete_song_image.object_name)
    and not exists (
      select 1
      from public.songs as s
      where s.cover_image_url = can_delete_song_image.object_name
    );
$$;

alter function internal.can_delete_song_image(text) owner to postgres;

revoke execute on function internal.can_delete_song_image(text) from public;
revoke execute on function internal.can_delete_song_image(text) from anon;
revoke execute on function internal.can_delete_song_image(text) from service_role;
grant execute on function internal.can_delete_song_image(text) to authenticated;

create policy song_images_admin_select
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'song-images'
    and public.is_admin()
  );

create policy song_images_admin_insert
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'song-images'
    and public.is_admin()
    and internal.is_valid_song_image_key(name)
  );

create policy song_images_admin_delete
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'song-images'
    and internal.can_delete_song_image(name)
  );
