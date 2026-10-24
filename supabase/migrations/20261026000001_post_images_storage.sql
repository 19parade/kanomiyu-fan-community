-- =============================================================================
-- 20261026000001_post_images_storage.sql
-- LIVE機能 Phase 4-B: Storage bucket `post-images`（private）・
--   RLSポリシー・アップロード頻度レート制限
--
-- PM確定方針: post-imagesはprivate bucket。閲覧は署名付きURL
--   （createSignedUrl、サーバーが発行者本人のセッションで呼び出す）。
--   一般会員は自分がアップロードした画像のみ管理できる（storage.objects
--   の owner_id 列を利用 — 検証用プロジェクトで実測済み。認証済み
--   ユーザーが直接アップロードすると owner / owner_id が自動的に
--   auth.uid() に設定されることを確認済み。他人のobjectに対する
--   DELETEがRLSで正しく拒否されることも確認済み）。
--
-- 対象（本migrationに含まれるもの）:
--   - storage.buckets への `post-images` の追加（public = false）
--   - internal.is_valid_post_image_key()（key形式検証。song-images /
--     event-imagesと同じパターン）
--   - storage.objects への post-images 専用policy（SELECT ×3・INSERT・
--     DELETE）
--   - storage.objects への BEFORE INSERT trigger（post-images bucketの
--     アップロード回数を 12件/1時間 に制限。post_imagesテーブルへの
--     INSERTトリガーではなく、Storageへの実際の書き込みそのものを
--     対象にする点が重要 — PM指摘「post_images INSERTトリガーだけでは
--     Storageアップロード回数そのものを制限できない」への対応）
--
-- 対象に含まれないもの:
--   - post_images テーブル・RLS・create_live_report_post()
--     （20261026000000_post_images.sqlで対応済み、本migrationでは
--     変更しない）
--   - event-images / song-images のbucket・policy・function（既存のまま、
--     一切変更しない）
--   - 署名付きURLの発行自体（アプリケーションコード側で
--     `supabase.storage.from('post-images').createSignedUrl()` を、
--     閲覧者本人のセッションで呼び出す。これにより下記のSELECT policyが
--     そのまま認可境界として機能する — 発行者側で追加の権限チェックを
--     複製する必要はないが、無駄なStorage API呼び出しを避けるための
--     fail-fastとして、アプリ側で親投稿の可視性を先に確認することを
--     推奨する）
--
-- -----------------------------------------------------------------------------
-- A. bucket作成
--
-- public = false（PM確定方針）。file_size_limit・allowed_mime_typesは
-- event-images / song-imagesと同じ値を踏襲する。
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'post-images',
  'post-images',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']::text[]
);


-- -----------------------------------------------------------------------------
-- B. key形式検証（song-images / event-imagesと同一パターン）
-- -----------------------------------------------------------------------------
create function internal.is_valid_post_image_key(object_name text)
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

alter function internal.is_valid_post_image_key(text) owner to postgres;

revoke execute on function internal.is_valid_post_image_key(text) from public;
revoke execute on function internal.is_valid_post_image_key(text) from anon;
revoke execute on function internal.is_valid_post_image_key(text) from service_role;
grant execute on function internal.is_valid_post_image_key(text) to authenticated;


-- -----------------------------------------------------------------------------
-- C. storage.objects ポリシー（post-images限定。bucket_idで他bucketへの
--    影響を遮断する）
--
-- INSERT: is_active_user()かつ有効なkey形式のみ。未ログイン（anon）には
--   一切のINSERT権限を付与しない。
-- SELECT: 3ポリシーに分離する（post_imagesテーブルのSELECT policyと同じ
--   3分割方針 — own/admin、公開anon、ログイン済み双方向block）。
--   署名付きURLの発行はこのSELECT可視性に従うため、ここがPM要件
--   「署名付きURL発行前に親投稿の閲覧権限を確認する」
--   「非表示・削除済み投稿には新しい閲覧URLを発行しない」
--   「双方向ブロック状態を閲覧権限に反映する」の実体となる。
-- DELETE: 本人（owner_id = auth.uid()）または active admin のみ。
--   song-images / event-imagesの「他のレコードから参照されていないか」
--   という追加チェックは不要（post_images.image_keyはUNIQUE制約により
--   1つのStorage objectは常に高々1つのpost_imagesにしか紐付かないため、
--   「他の投稿が使用中」という状態が構造的に発生しない）。
-- UPDATE: policyを作らない（overwrite不可。song-images / event-imagesと
--   同じ方針）。
-- -----------------------------------------------------------------------------
create policy post_images_storage_insert
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'post-images'
    and public.is_active_user()
    and internal.is_valid_post_image_key(name)
  );

-- 本人の全アップロード（post_imagesに未紐付けのものを含む）とadminの
-- 全件。本人が自分の未紐付け画像を一覧・削除できる必要があるための
-- policy（PM要件「一般会員は自分の画像だけアップロード・管理できる」）。
create policy post_images_storage_select_own_or_admin
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'post-images'
    and (owner_id = (select auth.uid())::text or public.is_admin())
  );

-- 未ログイン: 公開済み投稿に紐づく画像のみ（block概念なし）。
create policy post_images_storage_select_public_anon
  on storage.objects
  for select
  to anon
  using (
    bucket_id = 'post-images'
    and exists (
      select 1
      from public.post_images pi
      join public.posts p on p.id = pi.post_id
      where pi.image_key = storage.objects.name
        and p.status = 'published'
    )
  );

-- ログイン済み一般: 公開済み・コミュニティ閲覧可能・双方向blockでない
-- 投稿に紐づく画像のみ（post_images_select_visible_authenticatedと同一
-- 条件）。
create policy post_images_storage_select_visible_authenticated
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'post-images'
    and exists (
      select 1
      from public.post_images pi
      join public.posts p on p.id = pi.post_id
      where pi.image_key = storage.objects.name
        and p.status = 'published'
        and internal.is_community_browsing_allowed()
        and not internal.is_blocked_with(p.author_id)
    )
  );

create policy post_images_storage_delete
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'post-images'
    and (owner_id = (select auth.uid())::text or public.is_admin())
  );


-- -----------------------------------------------------------------------------
-- D. アップロード頻度のレート制限（12件 / 1時間、owner_id単位）
--
-- reports / live_reportの既存レート制限と同じ設計パターン
-- （BEFORE INSERT trigger、pg_advisory_xact_lockで同一ownerのINSERTを
-- 直列化、rolling window）。post-images bucket以外のINSERTには一切
-- 影響しない（song-images / event-imagesの管理者アップロードは対象外）。
-- post_imagesテーブルへのINSERT回数ではなく、Storageへの実際の
-- アップロード回数そのものを制限するため、投稿に紐付けないまま大量に
-- アップロードするような使い方も防止できる。
-- -----------------------------------------------------------------------------
create function internal.enforce_post_image_upload_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if new.bucket_id <> 'post-images' or new.owner_id is null then
    return new;
  end if;

  perform pg_advisory_xact_lock(
    ('x' || substr(md5('post_image_upload_rate_limit:' || new.owner_id), 1, 16))::bit(64)::bigint
  );

  select count(*)
    into v_count
    from storage.objects o
    where o.bucket_id = 'post-images'
      and o.owner_id = new.owner_id
      and o.created_at >= now() - interval '1 hour';

  if v_count >= 12 then
    raise exception 'POST_IMAGE_UPLOAD_RATE_LIMITED';
  end if;

  return new;
end;
$$;

create trigger storage_objects_enforce_post_image_rate_limit
  before insert on storage.objects
  for each row execute function internal.enforce_post_image_upload_rate_limit();
-- =============================================================================
