-- =============================================================================
-- 20261025000001_event_images_policies.sql
-- LIVE機能 Phase 4-A: Storage `event-images` のwrite boundary
--   key検証helper・delete可否helper・storage.objects のSELECT / INSERT / DELETE policy
--
-- supabase/migrations/20260928150000_song_images_policies.sql（song-images）と
-- 全く同じ構造・同じ検証ロジックを event-images 向けに適用する
--（songs.cover_image_url -> events.image_url への参照先の変更のみ）。
--
-- 対象: internal.is_valid_event_image_key() / internal.can_delete_event_image()
--   の作成と、storage.objects への event-images 専用のpolicy 3件（SELECT・
--   INSERT・DELETE）のみ。event-images の bucket（本phaseの直前migration）、
--   events のtable・列・制約・RLS・ACL、eventsのfunction、admin_logs、他の
--   bucket、Storageのfunction・trigger（storage.protect_delete等）は変更しない。
--   UPDATE policyは作らない（overwrite不可。差し替えは新しいkeyで行う）。
--
-- song-imagesと同じ理由でSELECT policyを設ける: can_delete_event_imageの
--   USINGのみでは、SELECT policyが0件の状態だとDELETE対象行がRLS上visible
--   にならず、DELETEが実際には0行に終わる（PostgreSQLのRLSはUPDATE/DELETEの
--   対象行の確定にSELECTの可視性が関与するため）。したがって、DELETEを実際に
--   機能させる前提として、active admin専用のSELECT policyを追加する（一般
--   公開のmetadata公開ではない。公開されるのはbucketがpublicであることに
--   よる画像bytesの配信のみで、storage.objectsのmetadataの一覧はactive
--   adminのみ）。
--
-- internal.is_valid_event_image_key(object_name) -> boolean
--   events.image_urlのobject key契約と同じ形式の検証のみ（bucket・認可・
--   eventsの参照・Storageのobjectの実在・MIME・sizeは担当しない）。root直下の
--   `{uuid}.{ext}`（uuidは8-4-4-4-12のhex。大文字小文字は受理。extは
--   lowercaseの jpg / jpeg / png / webp のみ）に完全一致する場合のみtrue。
--   NULL・blank・folder付き・URL・trimが必要な値・大文字の拡張子・その他の
--   拡張子はfalse（trimして受理しない）。SECURITY INVOKER・IMMUTABLE・
--   search_path=''。
--
-- internal.can_delete_event_image(object_name) -> boolean
--   呼び出し元がactive admin（public.is_admin()）かつ object_name が有効な
--   keyかつ public.events.image_url（draft・public・cancelledのどのstatusでも）
--   から参照されていない場合のみtrue。それ以外はfalse（例外は出さない。
--   非adminへは参照の有無を漏らさない）。eventsのbase tableをauthenticatedは
--   公開8列のみ直接読めるため SECURITY DEFINER（owner=postgres・STABLE・
--   search_path=''）。objectの実在は確認しない。EXECUTEはpostgresと
--   authenticatedのみ。
--
-- policy（roleはauthenticatedのみ。bucket_id = 'event-images' に限定し、
--   他のbucketへ影響しない）:
--   event_images_admin_select: USING (bucket_id = 'event-images' AND public.is_admin())
--   event_images_admin_insert: WITH CHECK (bucket_id = 'event-images' AND
--     public.is_admin() AND internal.is_valid_event_image_key(name))
--   event_images_admin_delete: USING (bucket_id = 'event-images' AND
--     internal.can_delete_event_image(name))
--   UPDATE policyがないため、同じkeyへのoverwrite（upsert）はできない
--   （差し替えは新しいkey）。
--
-- 注意: can_delete_event_image() の参照確認と、Storage APIによる実際のDELETE
--   の間にはTOCTOU raceが残る（別のadminが同時にそのkeyをeventへ設定し得る）。
--   最終的な削除順序はserver側のorchestrationで制御する（app/api/admin/
--   events/[id]/route.ts）。SQLから storage.objects を直接DELETEすることは
--   storage.protect_delete により引き続き禁止される（実削除はStorage API経由）。
-- public bucket（画像bytesはURL/keyを知る第三者が閲覧できる。draftも例外では
--   ない）の方針はこのmigrationで変更しない。
-- =============================================================================

create function internal.is_valid_event_image_key(object_name text)
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

alter function internal.is_valid_event_image_key(text) owner to postgres;

revoke execute on function internal.is_valid_event_image_key(text) from public;
revoke execute on function internal.is_valid_event_image_key(text) from anon;
revoke execute on function internal.is_valid_event_image_key(text) from service_role;
grant execute on function internal.is_valid_event_image_key(text) to authenticated;

create function internal.can_delete_event_image(object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    public.is_admin()
    and internal.is_valid_event_image_key(can_delete_event_image.object_name)
    and not exists (
      select 1
      from public.events as e
      where e.image_url = can_delete_event_image.object_name
    );
$$;

alter function internal.can_delete_event_image(text) owner to postgres;

revoke execute on function internal.can_delete_event_image(text) from public;
revoke execute on function internal.can_delete_event_image(text) from anon;
revoke execute on function internal.can_delete_event_image(text) from service_role;
grant execute on function internal.can_delete_event_image(text) to authenticated;

create policy event_images_admin_select
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'event-images'
    and public.is_admin()
  );

create policy event_images_admin_insert
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'event-images'
    and public.is_admin()
    and internal.is_valid_event_image_key(name)
  );

create policy event_images_admin_delete
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'event-images'
    and internal.can_delete_event_image(name)
  );
