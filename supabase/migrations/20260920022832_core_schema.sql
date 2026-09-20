-- =============================================================================
-- 0001_core_schema.sql
-- PROJECT_SPEC.md v1.16 準拠 - MVP DBスキーマの土台（コアテーブル定義）
--
-- 対象（13テーブル）: profiles, posts, comments, likes, events,
--       event_participants, reports, blocks, news, songs, admin_logs,
--       login_attempts, app_settings
--
-- 本migrationに含まれるもの:
--   - 上記13テーブルの CREATE TABLE（PK / FK / NOT NULL / DEFAULT / CHECK）
--   - UNIQUE制約
--   - 必要なindex
--   - updated_at自動更新用の共通trigger function（Q37）とその適用
--   - app_settings の初期レコード（Q49。current_terms_version / current_privacy_policy_version = '1.0'）
--
-- 本migrationに含まれないもの（後続migrationで対応）:
--   - is_admin() / is_active_user()
--   - signup trigger（auth.users -> profiles）
--   - RLS有効化・RLSポリシー
--   - profilesの列単位GRANT/REVOKE
--   - public_profiles VIEW
--   - admin_set_user_role() / admin_set_user_status() / record_policy_consent()
--   - レート制限トリガー・login_attemptsの並行処理対策（advisory lock）
--   - Storage buckets / Storage policies
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 拡張機能について
-- -----------------------------------------------------------------------------
-- gen_random_uuid() は PostgreSQL 13 以降、pgcrypto 等の拡張なしにコアで
-- 利用可能である（Supabase提供のPostgreSQLは15以降が標準）。
-- PROJECT_SPEC.md v1.16「UUID主キーの生成方針（確定）」に従い、
-- 利用可能な場合は不要な拡張機能を追加しない。
-- したがって本migrationでは CREATE EXTENSION は行わない。
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 共通: updated_at 自動更新トリガー関数（確定。Q37）
-- クライアントに updated_at を指定・管理させないための共通関数。
-- 単純に NEW.updated_at を書き換えるだけの用途のため SECURITY DEFINER にしない。
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;


-- =============================================================================
-- 6.1 profiles
-- =============================================================================
create table public.profiles (
  id uuid primary key references auth.users (id) on delete restrict,
  username text not null,
  display_name text not null,
  avatar_url text,
  bio text,
  fan_since date,
  role text not null default 'member',
  status text not null default 'active',
  terms_version text not null,
  terms_agreed_at timestamptz not null,
  privacy_policy_version text not null,
  privacy_policy_agreed_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint profiles_username_key unique (username),
  constraint profiles_username_format_check check (username ~ '^[a-z0-9_-]{3,20}$'),
  constraint profiles_role_check check (role in ('member', 'admin')),
  constraint profiles_status_check check (status in ('active', 'suspended', 'banned'))
);
-- profiles.id は auth.users(id) をそのまま使用するため、DEFAULT UUID生成は設定しない（Q44）。

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();


-- =============================================================================
-- 6.5 events
-- =============================================================================
create table public.events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  venue text not null,
  event_date timestamptz not null,
  description text,
  image_url text,
  ticket_url text,
  status text not null default 'upcoming',
  created_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint events_status_check check (status in ('upcoming', 'ended', 'cancelled'))
);

create trigger events_set_updated_at
  before update on public.events
  for each row execute function public.set_updated_at();

-- 6.5「表示制御」: LIVE一覧（/live）は status/event_date で絞り込み・並び替えされる。
create index events_status_event_date_idx on public.events (status, event_date);


-- =============================================================================
-- 6.10 songs
-- =============================================================================
create table public.songs (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  release_date date,
  cover_image_url text,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- created_by列は意図的に持たない（6.10「備考（作成者の記録について・確定）」）。

create trigger songs_set_updated_at
  before update on public.songs
  for each row execute function public.set_updated_at();


-- =============================================================================
-- 6.9 news
-- =============================================================================
create table public.news (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  content text not null,
  image_url text,
  source_url text,
  status text not null default 'draft',
  published_at timestamptz,
  created_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint news_status_check check (status in ('draft', 'published')),
  constraint news_published_requires_published_at_check
    check (status <> 'published' or published_at is not null)
);

create trigger news_set_updated_at
  before update on public.news
  for each row execute function public.set_updated_at();

-- 6.9「表示制御の方針」: 一般ユーザー向け公開済み記事一覧の絞り込み・並び替え用。
create index news_status_published_at_idx on public.news (status, published_at);


-- =============================================================================
-- 6.7 reports
-- =============================================================================
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles (id) on delete restrict,
  target_type text not null,
  target_id uuid not null,
  reason text not null,
  detail text,
  status text not null default 'pending',
  handled_by uuid references public.profiles (id) on delete restrict,
  handled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint reports_reporter_target_key unique (reporter_id, target_type, target_id),
  constraint reports_target_type_check check (target_type in ('post', 'comment', 'user')),
  constraint reports_status_check check (status in ('pending', 'reviewing', 'resolved', 'rejected')),
  constraint reports_reason_check check (
    reason in (
      'defamation',
      'threats',
      'discrimination',
      'harassment',
      'personal_info_exposure',
      'impersonation',
      'fraud',
      'ticket_scalping',
      'illegal_activity',
      'unauthorized_repost',
      'copyright_infringement',
      'full_lyrics_posting',
      'unauthorized_media_posting',
      'spam',
      'dating_solicitation',
      'other'
    )
  )
);
-- target_id はポリモーフィック参照のため、DB外部キー制約は付与しない（6.7）。

create trigger reports_set_updated_at
  before update on public.reports
  for each row execute function public.set_updated_at();

-- 6.7「通報時の挙動」: 管理者向け通報キュー（/admin/reports）の絞り込み・並び替え用。
create index reports_status_created_at_idx on public.reports (status, created_at);
-- reporter_id + created_at のCOUNT用（レート制限トリガーは0008で実装。8章参照）。
create index reports_reporter_id_created_at_idx on public.reports (reporter_id, created_at);


-- =============================================================================
-- 6.8 blocks
-- =============================================================================
create table public.blocks (
  id uuid primary key default gen_random_uuid(),
  blocker_id uuid not null references public.profiles (id) on delete restrict,
  blocked_id uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),

  constraint blocks_blocker_blocked_key unique (blocker_id, blocked_id),
  constraint blocks_no_self_block_check check (blocker_id <> blocked_id)
);
-- updated_atは持たない（6.8にupdated_atの定義がないため作成しない）。


-- =============================================================================
-- 6.11 admin_logs
-- =============================================================================
create table public.admin_logs (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references public.profiles (id) on delete restrict,
  action text not null,
  target_type text not null,
  target_id uuid not null,
  detail jsonb,
  created_at timestamptz not null default now()
);
-- action / target_type はfree text（DB CHECKによる固定enum化は行わない。6.11「DB制約（確定）」）。
-- target_id はポリモーフィック参照のため、DB外部キー制約は付与しない（6.11）。
-- updated_atは持たない（追記のみ、更新・削除禁止。6.11「書き込み経路の方針」）。


-- =============================================================================
-- 6.12 login_attempts
-- =============================================================================
create table public.login_attempts (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  ip_address inet,
  attempted_at timestamptz not null default now()
);
-- profiles/auth.usersへのFKは意図的に持たせない（6.12「リレーション」）。
-- updated_atは持たない（失敗発生の記録のみ。6.12にupdated_atの定義はない）。

-- 8章「レート制限の実装方式」: メールアドレス単位の直近ウィンドウCOUNT用。
-- COUNT・保存・ロックキー生成のいずれも同一の正規化ルール（trim(lower(email))相当。Q41）
-- を用いる前提。並行処理対策（pg_advisory_xact_lock等）は0008で実装する。
create index login_attempts_email_attempted_at_idx on public.login_attempts (email, attempted_at);


-- =============================================================================
-- 6.2 posts
-- =============================================================================
create table public.posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles (id) on delete restrict,
  post_type text not null default 'normal',
  event_id uuid references public.events (id) on delete restrict,
  content text not null,
  image_url text,
  status text not null default 'published',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint posts_post_type_check check (post_type in ('normal', 'live_report')),
  constraint posts_status_check check (status in ('published', 'hidden', 'deleted')),
  constraint posts_live_report_requires_event_id_check
    check (post_type <> 'live_report' or event_id is not null)
);
-- posts.event_id -> events.id は ON DELETE RESTRICT（確定。Q48。6章冒頭「その他のFKのON DELETE方針」参照）。

create trigger posts_set_updated_at
  before update on public.posts
  for each row execute function public.set_updated_at();

-- 6.2「status / 表示制御の方針」: 一般ユーザー向け公開投稿一覧（/community/posts）用。
create index posts_status_created_at_idx on public.posts (status, created_at desc);
-- /me/posts（自分の投稿一覧）用。author_id + created_at のCOUNT（レート制限、0008）にも利用。
create index posts_author_id_created_at_idx on public.posts (author_id, created_at desc);


-- =============================================================================
-- 6.3 comments
-- =============================================================================
create table public.comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete restrict,
  author_id uuid not null references public.profiles (id) on delete restrict,
  content text not null,
  status text not null default 'published',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint comments_status_check check (status in ('published', 'hidden', 'deleted'))
);
-- comments.post_id -> posts.id は ON DELETE RESTRICT（確定。Q48。6章冒頭「その他のFKのON DELETE方針」参照）。

create trigger comments_set_updated_at
  before update on public.comments
  for each row execute function public.set_updated_at();

-- 6.3「表示制御の方針」: 投稿詳細ページ（/community/posts/[id]）のコメント取得用。
create index comments_post_id_created_at_idx on public.comments (post_id, created_at);
-- author_id + created_at のCOUNT用（レート制限トリガーは0008で実装）。
create index comments_author_id_created_at_idx on public.comments (author_id, created_at);


-- =============================================================================
-- 6.4 likes
-- =============================================================================
create table public.likes (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete restrict,
  user_id uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),

  constraint likes_post_user_key unique (post_id, user_id)
);
-- likes.post_id -> posts.id は ON DELETE RESTRICT（確定。Q48。6章冒頭「その他のFKのON DELETE方針」参照）。
-- updated_atは持たない（6.4にupdated_atの定義はない）。

-- user_id + created_at のCOUNT用（レート制限トリガーは0008で実装）。
-- post_id + user_id の「いいね済みか」判定・投稿別いいね数はUNIQUE制約の索引で兼用する。
create index likes_user_id_created_at_idx on public.likes (user_id, created_at);


-- =============================================================================
-- 6.6 event_participants
-- =============================================================================
create table public.event_participants (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete restrict,
  user_id uuid not null references public.profiles (id) on delete restrict,
  status text not null default 'going',
  visibility text not null default 'public',
  created_at timestamptz not null default now(),

  constraint event_participants_event_user_key unique (event_id, user_id),
  constraint event_participants_status_check check (status in ('going', 'interested', 'cancelled')),
  constraint event_participants_visibility_check check (visibility in ('public', 'private', 'attended'))
);
-- event_participants.event_id -> events.id は ON DELETE RESTRICT（確定。Q48。6章冒頭「その他のFKのON DELETE方針」参照）。
-- updated_atは持たない（6.6にupdated_atの定義はない。状態変更はUPDATEで行うが、更新日時の記録自体は仕様上求められていない）。

-- /me/events（自分のLIVE参加表明一覧）用。event_id+user_idはUNIQUE制約の索引で兼用する。
create index event_participants_user_id_idx on public.event_participants (user_id);


-- =============================================================================
-- 6.13 app_settings
-- =============================================================================
-- 固定カラム・単一行方式（確定。Q47）。key-value方式は採用しない。
--
-- 単一行保証の方式: id を固定値(1)のみを許容する主キーとし、CHECK制約で
-- 「id は必ず 1 である」ことを強制する。
--   - PRIMARY KEY制約により、id列の値は一意でなければならない。
--   - CHECK制約 (id = 1) により、id列は 1 以外の値を取り得ない。
--   - 上記2つを組み合わせると、2行目をINSERTしようとした場合、
--     その行のidも1でなければCHECK制約違反となり、1であればPRIMARY KEY制約の
--     一意性違反となる。したがってどのような値であっても2行目のINSERTはDBに拒否され、
--     常に最大1行しか存在できない。
create table public.app_settings (
  id integer primary key default 1,
  current_terms_version text not null default '1.0',
  current_privacy_policy_version text not null default '1.0',
  updated_at timestamptz not null default now(),

  constraint app_settings_singleton_check check (id = 1)
);

create trigger app_settings_set_updated_at
  before update on public.app_settings
  for each row execute function public.set_updated_at();

-- 初期レコード（確定。Q49）。current_terms_version / current_privacy_policy_version は
-- いずれも数値ではなくtext値の '1.0' とする。
insert into public.app_settings (id, current_terms_version, current_privacy_policy_version)
values (1, '1.0', '1.0');
-- =============================================================================
