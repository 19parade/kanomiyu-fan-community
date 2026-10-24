-- =============================================================================
-- 20261026000000_post_images.sql
-- LIVE機能 Phase 4-B: LIVE掲示板の写真投稿 — post_imagesテーブル・RLS・
--   原子的作成RPC・投稿頻度レート制限
--
-- PM確定方針（2026-10-26付、Phase4-B設計レビュー②③）:
--   1. 最大4枚、JPEG/PNG/WebP、1枚5MiB
--   2. post_imagesを新設し、既存posts.image_urlは使用しない
--   3. 投稿と画像の紐付けはRPCで原子的に実行する
--   4. post_imagesのRLSは双方向ブロック（internal.is_blocked_with()）を
--      前提に設計する（本番にはまだ双方向ブロックmigration
--      20261012120000が未適用だが、検証用プロジェクトには適用済みであり、
--      本migrationはその適用後の状態に依存する。本番適用のタイミングは
--      PM判断。詳細は実装報告の「双方向ブロックとの依存関係」参照）
--   5. 写真付き投稿は3件/10分、画像アップロードは12枚/1時間
--
-- 対象（本migrationに含まれるもの）:
--   - public.post_images テーブルの新設
--   - post_images のRLS policy（SELECT: own/admin/anon公開/authenticated
--     双方向ブロック可視性。INSERT/UPDATE/DELETEのclient向けpolicyは
--     作らない — 書き込みはSECURITY DEFINER RPCのみで行う）
--   - public.create_live_report_post() RPC（posts + post_images の
--     原子的作成）
--   - internal.enforce_live_report_rate_limit()（postsへのBEFORE INSERT
--     trigger。post_type='live_report'の行のみ対象、3件/10分）
--
-- 対象に含まれないもの（別migrationで扱う）:
--   - Storage bucket `post-images` の作成・Storageポリシー・アップロード
--     レート制限trigger（20261026000001_post_images_storage.sql）
--   - 写真付き投稿の削除用サーバーAPI（アプリケーションコード。DBの
--     delete_own_post()自体は変更しない）
--   - posts.image_url列・既存のposts_image_url_null_only_check migration
--     （今回使用しない。無関係・無変更）
--   - 双方向ブロックmigration 20261012120000自体（変更しない）
--
-- -----------------------------------------------------------------------------
-- A. post_images テーブル
--
-- 1投稿あたり最大4枚: position 1〜4のCHECK + UNIQUE(post_id, position)に
--   よりスキーマ自体で上限を保証する（トリガー不要）。
-- image_key: UNIQUE制約により、同じStorage objectを複数投稿・複数位置で
--   使い回すことを防止する（他人が既にアップロードした画像の不正な
--   再利用や、同一画像の重複紐付けを防ぐ）。
-- post_id: ON DELETE RESTRICT（他のFKと同じ既存方針。postsは物理削除され
--   ない設計のため実際に発火することはないが、一貫性のため明示する）。
-- updated_at は持たない（画像の紐付けは作成時のみで、後から内容を更新
--   する操作がないため。event_participantsと同じ考え方）。
-- -----------------------------------------------------------------------------
create table public.post_images (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete restrict,
  image_key text not null unique,
  position smallint not null check (position between 1 and 4),
  created_at timestamptz not null default now(),
  unique (post_id, position)
);

create index post_images_post_id_idx on public.post_images (post_id);

alter table public.post_images enable row level security;


-- -----------------------------------------------------------------------------
-- B. post_images の読み取り境界
--
-- 書き込み（INSERT/UPDATE/DELETE）のclient向けpolicyは一切作らない。
-- 行の作成は本migrationのcreate_live_report_post()のみが行う
-- （SECURITY DEFINER・owner=postgresのためRLSをbypassする）。
-- 既存行の更新・削除の経路も現時点では存在しない（画像の差し替えは
-- 今回のPhase4-Bのスコープ外。将来必要になれば別途RPCを設計する）。
--
-- 読み取りは既存のposts/commentsのパターンを踏襲し、親postの可視性条件を
-- 各policy内に複製する（posts自体のRLSに委譲せず、明示的に複製する—
-- 20261012120000の comments_select_visible_authenticated と同一方針）。
-- -----------------------------------------------------------------------------

-- 本人は、親postのstatusに関わらず常に自分の投稿の画像一覧を読める
-- （posts_select_ownと同じ「本人は常に自分のものを見られる」方針。
-- 写真付き投稿の削除フローが、statusをdeletedへ変更した「後」でも
-- 画像keyを取得できる必要があるための設計）。
create policy post_images_select_own
  on public.post_images
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.posts p
      where p.id = post_images.post_id
        and p.author_id = auth.uid()
    )
  );

-- active adminは全画像を読める（moderation用途。posts_select_adminと同じ
-- 方針）。
create policy post_images_select_admin
  on public.post_images
  for select
  to authenticated
  using (public.is_admin());

-- 未ログイン（anon）: 公開済み投稿の画像のみ。block概念は存在しない
-- （posts_select_public_anonと同じ方針）。
create policy post_images_select_public_anon
  on public.post_images
  for select
  to anon
  using (
    exists (
      select 1
      from public.posts p
      where p.id = post_images.post_id
        and p.status = 'published'
    )
  );

-- ログイン済み一般: 親postが公開済み・コミュニティ閲覧可能・双方向block
-- でない場合のみ（posts_select_visible_authenticatedと同一条件を複製）。
create policy post_images_select_visible_authenticated
  on public.post_images
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.posts p
      where p.id = post_images.post_id
        and p.status = 'published'
        and internal.is_community_browsing_allowed()
        and not internal.is_blocked_with(p.author_id)
    )
  );

revoke all on table public.post_images from public;
grant select on table public.post_images to anon;
grant select on table public.post_images to authenticated;
-- INSERT/UPDATE/DELETEはanon/authenticatedいずれにも付与しない
-- （SECURITY DEFINER RPC経由のみ）。


-- -----------------------------------------------------------------------------
-- C. public.create_live_report_post(): LIVE掲示板投稿の原子的作成
--
-- posts（post_type='live_report'）と、最大4枚のpost_imagesを同一
-- transaction内で作成する。途中で何か失敗すれば（画像の所有者不一致・
-- 上限超過・対象eventが参照不可等）、postsへのINSERTを含め全体がrollback
-- される（PL/pgSQL関数は暗黙にtransaction内で実行されるため、追加の
-- BEGIN/EXCEPTIONブロックなしで原子性が保証される）。
--
-- 認可: is_active_user()のみ（投稿先はauth.uid()固定で、他人の名前で
-- 投稿することはできない）。
-- event参照の可否: 既存のposts_insert_ownと全く同じ条件
-- （exists (select 1 from events e where e.id = target_event_id)。
-- eventsのRLS（events_select_public、M11）を通した上でのEXISTS評価と
-- なるため、公開中またはM11で公開継続中のcancelled eventにのみ投稿でき、
-- draft・一度も公開されていないcancelled・不存在は同一のエラーになる
-- （M18で確定済みの契約をそのまま踏襲し、重複実装しない）。
--
-- 画像: image_keysは0〜4件のtext配列。各keyについて、
--   (1) storage.objects上でbucket_id='post-images'・owner_id=auth.uid()の
--       objectとして実在すること（他人がアップロードした画像を自分の
--       投稿に紐付けることを防止）
--   を検証した上でpost_imagesへINSERTする。position はarray内の順序
--   （1始まり）とする。
--
-- 戻り値: 作成したpostのidのみ。post_type・content・画像一覧の最新状態は
-- 既存の/feed/[id]取得経路・post_imagesの直接SELECTで別途取得する
-- （events/songsのadmin RPCと同じ「書き込みは最小限を返す、詳細は読み取り
-- 専用の経路で取る」方針）。
--
-- SECURITY DEFINER（owner=postgres）/ VOLATILE / search_path=''。
-- dynamic SQLは使用しない。
-- ACL: PUBLIC / anon / service_role からEXECUTEを取り消し、authenticatedに
-- 付与する。
-- -----------------------------------------------------------------------------
create function public.create_live_report_post(
  target_event_id uuid,
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

  if create_live_report_post.target_event_id is null then
    raise exception 'EVENT_NOT_AVAILABLE_FOR_POSTING';
  end if;

  -- SECURITY DEFINER（owner=postgres）で実行されるため、このEXISTSは
  -- events_select_public（M11のRLS）をbypassする — postgresは行レベル
  -- セキュリティの対象外のため、単純な`exists(select 1 from events where
  -- id=...)`だけでは draft・一度も公開されていないcancelled のeventも
  -- 見えてしまう（実際に検証用プロジェクトで誤って投稿が成功することを
  -- 確認し、本migrationで修正済み）。既存のposts_insert_own（M18、
  -- authenticatedロールとして評価されRLSが効く通常のpolicy）とは実行
  -- コンテキストが異なるため、同じ`exists`の書き方を安全に転用できない。
  -- そのためevents_select_publicの公開条件をここで明示的に複製する
  -- （comments_select_visible_authenticated等が親postの条件を複製する
  -- のと同じ考え方）。
  if not exists (
    select 1
    from public.events e
    where e.id = create_live_report_post.target_event_id
      and (
        e.status = 'public'
        or (e.status = 'cancelled' and e.first_published_at is not null)
      )
  ) then
    raise exception 'EVENT_NOT_AVAILABLE_FOR_POSTING';
  end if;

  v_image_count := coalesce(array_length(create_live_report_post.image_keys, 1), 0);
  if v_image_count > 4 then
    raise exception 'TOO_MANY_POST_IMAGES';
  end if;

  -- content自体の正規化・文字数検証は既存postsテーブルの制約（現状・
  -- 将来とも）にすべて委ね、ここで独自の規則を追加しない。これは
  -- components/feed/PostForm.tsxの直接INSERT経路と同じ前提であり、
  -- 新しいvalidationルールを本RPCだけのために発明しない。
  insert into public.posts (author_id, content, post_type, event_id)
  values (
    v_author_id,
    create_live_report_post.content,
    'live_report',
    create_live_report_post.target_event_id
  )
  returning id into v_post_id;

  if v_image_count > 0 then
    foreach v_key in array create_live_report_post.image_keys loop
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

revoke execute on function public.create_live_report_post(uuid, text, text[]) from public;
revoke execute on function public.create_live_report_post(uuid, text, text[]) from anon;
revoke execute on function public.create_live_report_post(uuid, text, text[]) from service_role;
grant execute on function public.create_live_report_post(uuid, text, text[]) to authenticated;


-- -----------------------------------------------------------------------------
-- D. 写真付き投稿のレート制限（3件 / 10分）
--
-- 既存のinternal.enforce_report_rate_limit()（reports, 5件/10分）と全く
-- 同じ設計パターン（BEFORE INSERT trigger、pg_advisory_xact_lockで同一
-- authorのINSERTを直列化、rolling window）。post_type='live_report'の
-- 行のみを対象とし、通常投稿（post_type='normal'）には一切影響しない。
-- create_live_report_post() 経由・将来の他の経路によるINSERTのいずれにも
-- table-level triggerとして発火する「最終防衛線」とする。
-- -----------------------------------------------------------------------------
create function internal.enforce_live_report_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if new.post_type <> 'live_report' then
    return new;
  end if;

  perform pg_advisory_xact_lock(
    ('x' || substr(md5('live_report_rate_limit:' || new.author_id::text), 1, 16))::bit(64)::bigint
  );

  select count(*)
    into v_count
    from public.posts p
    where p.author_id = new.author_id
      and p.post_type = 'live_report'
      and p.created_at >= now() - interval '10 minutes';

  if v_count >= 3 then
    raise exception 'LIVE_REPORT_RATE_LIMITED';
  end if;

  return new;
end;
$$;

create trigger posts_enforce_live_report_rate_limit
  before insert on public.posts
  for each row execute function internal.enforce_live_report_rate_limit();
-- =============================================================================
