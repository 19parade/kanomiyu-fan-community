-- =============================================================================
-- 20261027000000_link_previews.sql
-- 投稿本文中のURLリンクプレビュー機能: link_previewsキャッシュテーブル・
--   取得レート制限・書き込み用RPC
--
-- PM確定方針（2026-10-27付、設計レビュー）:
--   1. URLごとの共有キャッシュテーブルとして持つ（投稿ごとではない）
--   2. 取得（外部への実アクセス）は投稿作成時（フォーム側）に1回だけ行う。
--      ページ閲覧のたびに外部へアクセスする経路は作らない。
--   3. 実際の外部HTTPアクセス（YouTube/TikTok oEmbed・OGPスクレイピング）は
--      Node.js側（app/api/link-preview/route.ts）で行う。Postgres側は
--      取得結果の保存とレート制限のみを担当する。
--   4. 取得試行は1ユーザーあたり20回/10分（キャッシュ命中時はこのRPCを
--      呼ばないため、通常利用でこの上限に達することはない）。
--
-- 対象（本migrationに含まれるもの）:
--   - public.link_previews テーブルの新設（URL単位の共有キャッシュ）
--   - link_previews のRLS policy（SELECT: anon/authenticated 全員。
--     INSERT/UPDATE/DELETEのclient向けpolicyは作らない — 書き込みは
--     SECURITY DEFINER RPCのみ）
--   - internal.link_preview_fetch_log テーブル（レート制限専用、RLSを
--     有効化した上でpolicyを一切作らず、SECURITY DEFINER関数経由でのみ
--     到達可能にする）
--   - public.check_and_log_link_preview_fetch() RPC（レート制限チェック＋
--     ログ記録。実際の外部アクセスの「前」に呼ぶ）
--   - public.upsert_link_preview() RPC（取得結果の保存。成功・失敗いずれも
--     保存し、失敗結果もキャッシュすることで同じ壊れたURLへの再試行間隔を
--     あける）
--
-- 対象に含まれないもの（別途アプリケーションコードで実装）:
--   - 実際の外部HTTPアクセス・SSRF対策・OGP/oEmbedパース
--   - 投稿本文からのURL抽出ロジック
--   - UI（リンクプレビューカード・一覧カードのオーバーレイリンク化）
--
-- -----------------------------------------------------------------------------
-- A. link_previews テーブル
--
-- urlを主キーとする共有キャッシュ。postsとの外部キー関係は持たない
-- （どの投稿がこのURLを参照しているかは都度contentから抽出して照合する
-- 設計のため）。公開済み投稿の本文に既に表示されているURLの補足情報
-- （タイトル・画像など）のみを保持し、新たな非公開情報は一切含まない。
-- -----------------------------------------------------------------------------
create table public.link_previews (
  url text primary key check (char_length(url) between 1 and 2048),
  provider text not null check (provider in ('youtube', 'tiktok', 'x', 'generic')),
  status text not null check (status in ('ok', 'error')),
  title text check (title is null or char_length(title) <= 300),
  description text check (description is null or char_length(description) <= 500),
  image_url text check (image_url is null or char_length(image_url) <= 2048),
  site_name text check (site_name is null or char_length(site_name) <= 200),
  fetched_at timestamptz not null default now()
);

alter table public.link_previews enable row level security;

-- 本文中に既に表示されているURLの補足情報にすぎないため、posts自体の
-- 可視性条件（block・コミュニティ閲覧制限等）をここで複製する必要はない
-- — このテーブル単体の行を読めても、それがどの投稿のものかはcontentの
-- 中身を知っている側（＝既にそのpostsのRLSを通過した側）でしか紐付け
-- られない。
create policy link_previews_select_all
  on public.link_previews
  for select
  to anon, authenticated
  using (true);

revoke all on table public.link_previews from public;
grant select on table public.link_previews to anon;
grant select on table public.link_previews to authenticated;
-- INSERT/UPDATE/DELETEはanon/authenticatedいずれにも付与しない
-- （SECURITY DEFINER RPC経由のみ）。


-- -----------------------------------------------------------------------------
-- B. internal.link_preview_fetch_log — レート制限専用ログ
--
-- 「取得を試みた」こと自体を記録する。link_previews自体はURL単位の
-- キャッシュで、同じユーザーが同じ未キャッシュURLを短時間に連投しても
-- 1行にしかならないため、試行回数のカウントには使えない。そのため専用の
-- ログテーブルを持つ。クライアントから直接読み書きする経路は一切作らず
-- （RLS有効化のみでpolicyは作らない）、SECURITY DEFINER関数からのみ
-- 到達可能にする。
-- -----------------------------------------------------------------------------
create table internal.link_preview_fetch_log (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  created_at timestamptz not null default now()
);

create index link_preview_fetch_log_user_id_created_at_idx
  on internal.link_preview_fetch_log (user_id, created_at);

alter table internal.link_preview_fetch_log enable row level security;
-- policyを一切作らない = postgres(owner)以外からは行が一切見えない。

revoke all on table internal.link_preview_fetch_log from public;
revoke all on table internal.link_preview_fetch_log from anon;
revoke all on table internal.link_preview_fetch_log from authenticated;
revoke all on table internal.link_preview_fetch_log from service_role;


-- -----------------------------------------------------------------------------
-- C. public.check_and_log_link_preview_fetch(): レート制限チェック＋記録
--
-- app/api/link-preview/route.ts が、実際の外部HTTPアクセスを行う「前」に
-- 呼ぶ。internal.enforce_report_rate_limit()と同じ設計パターン
-- （pg_advisory_xact_lockで同一ユーザーの呼び出しを直列化、rolling
-- window）。1ユーザーあたり20回/10分。超過時は例外を投げ、呼び出し元
-- （Route Handler）は実際の外部アクセスを行わない。
-- -----------------------------------------------------------------------------
create function public.check_and_log_link_preview_fetch()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_count integer;
begin
  if v_user_id is null or not public.is_active_user() then
    raise exception 'LINK_PREVIEW_FETCH_NOT_AUTHORIZED';
  end if;

  perform pg_advisory_xact_lock(
    ('x' || substr(md5('link_preview_fetch:' || v_user_id::text), 1, 16))::bit(64)::bigint
  );

  select count(*)
    into v_count
    from internal.link_preview_fetch_log l
    where l.user_id = v_user_id
      and l.created_at >= now() - interval '10 minutes';

  if v_count >= 20 then
    raise exception 'LINK_PREVIEW_FETCH_RATE_LIMITED';
  end if;

  insert into internal.link_preview_fetch_log (user_id) values (v_user_id);
end;
$$;

revoke execute on function public.check_and_log_link_preview_fetch() from public;
revoke execute on function public.check_and_log_link_preview_fetch() from anon;
revoke execute on function public.check_and_log_link_preview_fetch() from service_role;
grant execute on function public.check_and_log_link_preview_fetch() to authenticated;


-- -----------------------------------------------------------------------------
-- D. public.upsert_link_preview(): 取得結果の保存
--
-- app/api/link-preview/route.ts が、外部アクセス（成功・失敗いずれも）の
-- 結果をここで保存する。失敗結果（status='error'）も保存することで、
-- 壊れた/対応していないURLへの再試行間隔を空ける（Route Handler側で
-- fetched_atを見て再試行の要否を判断する）。
--
-- 認可: is_active_user()のみ。他人になりすましての書き込みという概念が
-- 存在しない（urlをキーにした共有キャッシュであり、呼び出し者の識別情報
-- を一切保存しないため）。
-- -----------------------------------------------------------------------------
create function public.upsert_link_preview(
  p_url text,
  p_provider text,
  p_status text,
  p_title text default null,
  p_description text default null,
  p_image_url text default null,
  p_site_name text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.is_active_user() then
    raise exception 'LINK_PREVIEW_WRITE_NOT_AUTHORIZED';
  end if;

  if p_url is null or char_length(p_url) < 1 or char_length(p_url) > 2048 then
    raise exception 'INVALID_LINK_PREVIEW_URL';
  end if;

  if p_provider not in ('youtube', 'tiktok', 'x', 'generic') then
    raise exception 'INVALID_LINK_PREVIEW_PROVIDER';
  end if;

  if p_status not in ('ok', 'error') then
    raise exception 'INVALID_LINK_PREVIEW_STATUS';
  end if;

  insert into public.link_previews (url, provider, status, title, description, image_url, site_name, fetched_at)
  values (
    p_url,
    p_provider,
    p_status,
    left(p_title, 300),
    left(p_description, 500),
    left(p_image_url, 2048),
    left(p_site_name, 200),
    now()
  )
  on conflict (url) do update set
    provider = excluded.provider,
    status = excluded.status,
    title = excluded.title,
    description = excluded.description,
    image_url = excluded.image_url,
    site_name = excluded.site_name,
    fetched_at = excluded.fetched_at;
end;
$$;

revoke execute on function public.upsert_link_preview(text, text, text, text, text, text, text) from public;
revoke execute on function public.upsert_link_preview(text, text, text, text, text, text, text) from anon;
revoke execute on function public.upsert_link_preview(text, text, text, text, text, text, text) from service_role;
grant execute on function public.upsert_link_preview(text, text, text, text, text, text, text) to authenticated;
-- =============================================================================
