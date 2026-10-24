-- =============================================================================
-- 20261025000000_event_images_bucket.sql
-- LIVE機能 Phase 4-A: Storage bucket `event-images` の作成のみ
--
-- 対象: storage.buckets に event-images を1件作成する。storage.objects の
--   policy・Storage関連のfunction・trigger・ACL、public schemaの全object
--   （events・function・RLS・policy・ACL）、他のbucketは変更しない。
--   policy・key検証・helper・objectのupload / deleteはこのmigrationの範囲外
--   （後続の20261025000001_event_images_policies.sql）。
--
-- supabase/migrations/20260928140000_song_images_bucket.sql（song-images）と
-- 全く同じ方針・同じ値を event-images 向けに適用する。
--
-- bucket:
--   id / name = 'event-images'
--   public = true（public bucket。draftのLIVEに設定された画像でも、
--     object key / URLを知っていれば閲覧できる。draftはStorageの非公開境界
--     ではなく、public -> draft に戻しても既知のURLへのアクセス不能や、
--     CDN / browser cacheを含む即時の非公開化は保証しない）
--   file_size_limit = 5242880（5 MiB = 5 * 1024 * 1024 bytes）
--   allowed_mime_types = image/jpeg, image/png, image/webp のみ
--
-- 既存のbucketがある場合は、暗黙に上書き・受け入れせず、主キー違反でこの
-- migrationを失敗させる（ON CONFLICT は使わない）。このmigrationはpolicyを
-- 作らないため、適用後もクライアント（anon・authenticated）からのobjectの
-- 書き込みは不可のままである。
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'event-images',
  'event-images',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']::text[]
);
