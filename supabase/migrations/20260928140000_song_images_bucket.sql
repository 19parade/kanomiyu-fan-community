-- =============================================================================
-- 20260928140000_song_images_bucket.sql
-- Storage bucket `song-images` (ST1): bucketの作成のみ
--
-- 対象: storage.buckets に song-images を1件作成する。storage.objects のpolicy・
--   Storage関連のfunction・trigger・ACL、public schemaの全object（songs・function・RLS・
--   policy・ACL）、他のbucketは変更しない。policy・key検証・helper・objectのupload / deleteは
--   このmigrationの範囲外（後続のST2以降）。
--
-- bucket:
--   id / name = 'song-images'
--   public = true（public bucket。draftの楽曲に設定された画像でも、object key / URLを知っていれば
--     閲覧できる。draftはStorageの非公開境界ではなく、public -> draft に戻しても既知のURLへの
--     アクセス不能や、CDN / browser cacheを含む即時の非公開化は保証しない）
--   file_size_limit = 5242880（5 MiB = 5 * 1024 * 1024 bytes）
--   allowed_mime_types = image/jpeg, image/png, image/webp のみ（jpg・jpeg拡張子はどちらも image/jpeg）
--
-- 既存のbucketがある場合は、暗黙に上書き・受け入れせず、主キー違反でこのmigrationを失敗させる
-- （ON CONFLICT は使わない）。このmigrationはpolicyを作らないため、適用後もクライアント
-- （anon・authenticated）からのobjectの書き込みは不可のままである。
-- 001〜045は変更しない。
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'song-images',
  'song-images',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']::text[]
);
