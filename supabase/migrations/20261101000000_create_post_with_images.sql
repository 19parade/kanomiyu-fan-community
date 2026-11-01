-- =============================================================================
-- 20261101000000_create_post_with_images.sql
-- みんなの掲示板（通常投稿、post_type='normal'）への写真投稿機能追加:
--   public.create_post_with_images()
--
-- PM確定方針（2026-11-01付）: LIVE掲示板（post_type='live_report'）で
--   2026-10-26に導入した写真投稿・閲覧機能を、通常投稿（みんなの掲示板）
--   にも同じ仕様で追加する。過去のPhase4-B設計時点の「通常フィードへの
--   画像投稿は追加しない」というスコープ決定を、本migrationで明示的に
--   変更する（components/feed/PostForm.tsx側の対応するコメントも同様に
--   更新する）。
--
-- 閲覧側は追加作業不要: post_images のRLS policy
--   （post_images_select_own / _admin / _public_anon /
--   _visible_authenticated, 20261026000000）、storage.objects の
--   post-images SELECT policy（20261026000001）のいずれも、条件は
--   親postの status / community-browsing / 双方向block のみで、
--   post_type列を一切参照していない。つまり通常投稿に画像を紐付けさえ
--   すれば、既存の閲覧経路（署名付きURL発行・PostImageGallery
--   コンポーネント）がそのまま機能する。本migrationが対象とするのは
--   「原子的に作成する書き込み経路」のみ。
--
-- 対象（本migrationに含まれるもの）:
--   - public.create_post_with_images() RPC の新規作成とEXECUTE ACLのみ
--
-- 対象に含まれないもの（意図的に変更しない）:
--   - create_live_report_post()（20261026000000。LIVE掲示板専用のまま、
--     event_id必須・event可視性チェックを維持。本RPCとは完全に独立した
--     別関数とする — 1つの関数にevent_idをoptionalにして統合すると、
--     「LIVE掲示板向けの投稿なのにevent_idを省略できてしまう」という
--     誤用経路が生まれるため、既存関数は変更せず新規関数を追加する方針
--     とした）
--   - post_images / storage.objects のtable・RLS・policy・ACL
--     （20261026000000・20261026000001のまま、無変更）
--   - internal.enforce_live_report_rate_limit()
--     （post_type='live_report'の行のみを対象とする既存の投稿頻度
--     制限で、本migrationでも変更しない。通常投稿には導入時から
--     レート制限がなく、本migrationもそれを変更しない — 写真の有無に
--     関わらず通常投稿の頻度制限は今回のスコープ外とする、PM確定方針）
--   - internal.enforce_post_image_upload_rate_limit()
--     （storage.objectsへのアップロード回数そのものを bucket_id
--     単位で制限する既存のtrigger、20261026000001。post_type を
--     一切参照しないため、通常投稿の写真アップロードにも変更なしで
--     既に適用される）
--
-- create_post_with_images(content, image_keys) -> uuid
--   - create_live_report_post()（20261026000000）とほぼ同一の構造。
--     相違点はevent_id関連の一切（パラメータ・存在チェック・可視性
--     チェック）を持たないことのみ。
--   - 認可: is_active_user()のみ（投稿先はauth.uid()固定）。
--   - postsへのINSERTはauthor_id・contentのみを指定し、post_type/
--     status は列のdefault（'normal'・'published'）に委ねる —
--     components/feed/PostForm.tsxの既存の直接INSERT経路
--     （画像なしの投稿）と完全に同じ結果になることを保証するため。
--   - 画像: image_keysは0〜4件のtext配列。各keyについて
--     storage.objects上でbucket_id='post-images'・owner_id=auth.uid()の
--     objectとして実在することを検証した上でpost_imagesへINSERTする
--     （create_live_report_post()と同一ロジック）。
--   - 戻り値: 作成したpostのidのみ。
--
-- SECURITY DEFINER（owner=postgres）/ VOLATILE / search_path=''。
--   dynamic SQLは使用しない。
-- ACL: PUBLIC / anon / service_role からEXECUTEを取り消し、authenticatedに
--   付与する。
-- 001〜044は変更しない。
-- =============================================================================

create function public.create_post_with_images(
  content text,
  image_keys text[] default array[]::text[]
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_author_id uuid := auth.uid();
  v_post_id uuid;
  v_key text;
  v_position smallint := 0;
  v_image_count integer;
begin
  if v_author_id is null or not public.is_active_user() then
    raise exception 'POST_NOT_AUTHORIZED';
  end if;

  v_image_count := coalesce(array_length(create_post_with_images.image_keys, 1), 0);
  if v_image_count > 4 then
    raise exception 'TOO_MANY_POST_IMAGES';
  end if;

  -- content自体の正規化・文字数検証は既存postsテーブルの制約にすべて
  -- 委ね、ここで独自の規則を追加しない（create_live_report_post()と
  -- 同じ前提）。post_type・statusは列のdefault（'normal'・'published'）
  -- に委ね、明示的に指定しない。
  insert into public.posts (author_id, content)
  values (
    v_author_id,
    create_post_with_images.content
  )
  returning id into v_post_id;

  if v_image_count > 0 then
    foreach v_key in array create_post_with_images.image_keys loop
      v_position := v_position + 1;

      if not exists (
        select 1
        from storage.objects o
        where o.bucket_id = 'post-images'
          and o.name = v_key
          and o.owner_id = v_author_id::text
      ) then
        raise exception 'POST_IMAGE_NOT_OWNED';
      end if;

      insert into public.post_images (post_id, image_key, position)
      values (v_post_id, v_key, v_position);
    end loop;
  end if;

  return v_post_id;
end;
$$;

revoke execute on function public.create_post_with_images(text, text[]) from public;
revoke execute on function public.create_post_with_images(text, text[]) from anon;
revoke execute on function public.create_post_with_images(text, text[]) from service_role;
grant execute on function public.create_post_with_images(text, text[]) to authenticated;
-- =============================================================================
