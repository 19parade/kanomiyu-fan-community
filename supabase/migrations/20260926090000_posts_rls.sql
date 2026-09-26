-- =============================================================================
-- 20260926090000_posts_rls.sql
-- posts RLS - RLS ENABLE + 最小権限GRANT/REVOKE + delete_own_post()
--
-- 対象（本migrationに含まれるもの）:
--   - public.posts: anon/authenticatedのtable-level ACL最小化
--   - public.posts: authenticatedへのcolumn-level UPDATE GRANT（content/image_urlのみ）
--   - public.posts: ENABLE ROW LEVEL SECURITY（FORCE RLSは使用しない）
--   - policy 6件: posts_select_public_anon / posts_select_visible_authenticated /
--     posts_select_own / posts_select_admin / posts_insert_own / posts_update_own
--   - public.delete_own_post(target_post_id uuid): self-delete用SECURITY DEFINER RPC
--
-- 本migrationに含まれないもの（後続migrationで対応）:
--   - comments（RLS/ACL/delete_own_comment()いずれも次フェーズ）
--   - moderate_post()/moderate_comment()
--   - likes/reports/event_participantsのRLS
--   - internal.is_community_browsing_allowed() / internal.is_blocked_with() /
--     public.is_admin() / public.is_active_user() / internal schema ACL
--     （いずれも変更禁止・無変更。前migration20260926061500でauthenticatedへの
--     EXECUTEを付与済み）
--   - 新しいindex・rate limit・Storage・Next.jsコード
--
-- 20260920022832_core_schema.sql（001）〜20260926061500_grant_community_browsing_helper_execute.sql（011）
-- はいずれも変更しない。
--
-- -----------------------------------------------------------------------------
-- 実装前に読み取り専用で確認した事実（前回調査からdriftなし）:
--   - public.posts の owner = postgres。RLS無効、policy 0件。
--   - 現在のACL: anon/authenticated/postgres/service_role いずれも
--     DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE
--     （table-level、全列）を保持。
--   - internal.is_community_browsing_allowed() は owner=postgres・
--     SECURITY DEFINER・search_path=''・authenticatedへのEXECUTE権限を
--     20260926061500で確定済み（本migrationでは変更しない）。
--   - internal.is_blocked_with() は双方向block判定であり、PROJECT_SPEC.md
--     6.8が要求するposts一方向block filteringには使用しない。posts側では
--     public.blocksへの直接EXISTSサブクエリ（blocker_id = auth.uid()のみを
--     参照）で一方向判定を行う。このサブクエリが参照する行は既存の
--     blocks_select_own policy（blocker_id = auth.uid()）の範囲と完全に
--     一致するため、blocks側のACL/RLSは変更しない。
--   - profiles 4a・blocks RLSは前回確定状態のまま無変更。
--   - comments RLS=false、policy=0のまま、本migrationでは一切変更しない。
-- -----------------------------------------------------------------------------


-- -----------------------------------------------------------------------------
-- anon: postsへの全権限を明示的にREVOKEしてから、SELECTのみを再付与する。
-- column-level UPDATEは一切付与しない。
-- -----------------------------------------------------------------------------
revoke all on table public.posts from anon;

grant select
  on table public.posts
  to anon;


-- -----------------------------------------------------------------------------
-- authenticated: 広いtable-level権限を一度すべて取り消してから、
-- SELECT/INSERTのみを再付与し、UPDATEはcontent/image_urlの2列のみを
-- column-level GRANTで許可する。id/author_id/post_type/event_id/status/
-- created_at/updated_atはこの2列に含まれないため直接UPDATE不可のまま。
-- -----------------------------------------------------------------------------
revoke all on table public.posts from authenticated;

grant select, insert
  on table public.posts
  to authenticated;

grant update (content, image_url)
  on table public.posts
  to authenticated;


-- -----------------------------------------------------------------------------
-- RLSを有効化する。FORCE ROW LEVEL SECURITYは使用しない
-- （owner=postgresはBYPASSRLSのため、delete_own_post()の内部UPDATEに影響
-- しない）。
-- -----------------------------------------------------------------------------
alter table public.posts enable row level security;


-- -----------------------------------------------------------------------------
-- posts_select_public_anon: anonはpublished投稿のみSELECT可能。
-- anonにはblock filteringという概念が存在しないため条件に含めない。
-- -----------------------------------------------------------------------------
create policy posts_select_public_anon
  on public.posts
  for select
  to anon
  using (
    status = 'published'
  );


-- -----------------------------------------------------------------------------
-- posts_select_visible_authenticated: authenticatedのfan-facing可視性。
-- community browsing可否は internal.is_community_browsing_allowed() で判定
-- する（active/suspended→true、banned→false）。block filteringは
-- viewer(auth.uid())がauthorをblockしている場合のみ除外する一方向判定であり、
-- 双方向helperの internal.is_blocked_with() は使用しない。author側が
-- viewerをblockしていても本policyの可視性には影響しない。
-- -----------------------------------------------------------------------------
create policy posts_select_visible_authenticated
  on public.posts
  for select
  to authenticated
  using (
    status = 'published'
    and internal.is_community_browsing_allowed()
    and not exists (
      select 1
      from public.blocks b
      where b.blocker_id = auth.uid()
        and b.blocked_id = posts.author_id
    )
  );


-- -----------------------------------------------------------------------------
-- posts_select_own: 本人は自分のpostsをstatusに関わらず（published/hidden/
-- deletedいずれも）SELECT可能。is_active_user()・
-- is_community_browsing_allowed()はいずれも参照しない。したがってactive/
-- suspended/banned問わず、本人は常に自分のpostsを閲覧できる。
-- -----------------------------------------------------------------------------
create policy posts_select_own
  on public.posts
  for select
  to authenticated
  using (
    author_id = auth.uid()
  );


-- -----------------------------------------------------------------------------
-- posts_select_admin: active adminはmoderation用途としてbase tableから
-- 全author・全statusをSELECT可能。本policyはfan-facing visibilityを
-- 表すものではない。対応するUPDATE/DELETE policyは作成しない
-- （adminによる他人postの直接base table UPDATE/DELETEは今回許可しない）。
-- -----------------------------------------------------------------------------
create policy posts_select_admin
  on public.posts
  for select
  to authenticated
  using (
    public.is_admin()
  );


-- -----------------------------------------------------------------------------
-- posts_insert_own: active本人のみ、自分をauthorとしてINSERT可能。
-- status='published'を必須とし、hidden/deleted指定でのINSERTを禁止する。
-- post_type/event_idについては既存のCHECK制約（posts_post_type_check /
-- posts_live_report_requires_event_id_check）をそのまま利用し、新しい
-- CHECK制約は追加しない。
-- -----------------------------------------------------------------------------
create policy posts_insert_own
  on public.posts
  for insert
  to authenticated
  with check (
    author_id = auth.uid()
    and public.is_active_user()
    and status = 'published'
  );


-- -----------------------------------------------------------------------------
-- posts_update_own: active本人が自分のpublished postのみUPDATE可能。
-- USING（対象行の絞り込み）とWITH CHECK（更新後の行の検証）の両方に
-- 同一条件を明示し、column-level GRANT（content/image_urlのみ）との
-- 二重防御とする。author_id/status/post_type/event_id等はcolumn-level
-- GRANTで直接UPDATE不可であることに加え、USING/WITH CHECK両方が
-- author_id=auth.uid() and status='published'を要求するため、hidden/
-- deletedな行や他人の行を対象にした更新はそもそもRLSの時点で拒否される。
-- admin用のUPDATE policyは作成しない（adminは自分のpostについては本
-- policyの対象になるが、他人のpostを直接UPDATEする経路は存在しない）。
-- -----------------------------------------------------------------------------
create policy posts_update_own
  on public.posts
  for update
  to authenticated
  using (
    author_id = auth.uid()
    and public.is_active_user()
    and status = 'published'
  )
  with check (
    author_id = auth.uid()
    and public.is_active_user()
    and status = 'published'
  );

-- DELETE policyは作成しない（PM確定仕様2.8参照）。postsの物理DELETEはanon/
-- authenticatedいずれにも許可しない（table-level DELETE privilege自体を
-- 上記REVOKEにより保持していない）。


-- -----------------------------------------------------------------------------
-- public.delete_own_post(target_post_id uuid): self-delete用RPC。
--
-- 認可条件はauthor_id = auth.uid()のみで、caller自身のprofile statusは
-- 確認しない（active/suspended/banned問わず、縮小操作として許可する
-- というPM確定仕様）。許可されるstatus遷移はpublished→deletedおよび
-- hidden→deletedのみで、既にdeletedな行は対象から除外されるため
-- UPDATE 0件となり、エラーにはせず成功扱いで返す（冪等）。deletedからの
-- 復帰経路はこの関数に一切実装しない。
--
-- 他人所有のpost・不存在のUUIDについても、対象行が0件になるという
-- 同一の結果を返すのみで、これらを区別する例外・戻り値は設けない
-- （existence oracle対策）。auth.uid()がNULLの場合はauthor_id=auth.uid()
-- が常にfalseとなり、どの行も更新されない。
--
-- SECURITY DEFINER・owner=postgres・search_path=''。内部参照はすべて
-- fully-qualified。既存のposts_set_updated_at trigger（BEFORE UPDATE →
-- public.set_updated_at()）は変更せず、そのまま利用する
-- （published/hidden→deletedへの実際のUPDATEが発生した場合のみ
-- updated_atが更新され、対象0件の場合はtriggerが発火しないため
-- updated_atも変化しない）。
-- -----------------------------------------------------------------------------
create function public.delete_own_post(target_post_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.posts
  set status = 'deleted'
  where id = target_post_id
    and author_id = auth.uid()
    and status in ('published', 'hidden');
$$;

revoke execute on function public.delete_own_post(uuid) from public;
revoke execute on function public.delete_own_post(uuid) from anon;
grant execute on function public.delete_own_post(uuid) to authenticated;

-- service_role/postgresへは新たなGRANT/REVOKEを行わない。CREATE FUNCTIONの
-- default privilege（postgres所有・publicスキーマ）により、postgres・
-- service_roleへは既存のis_admin()等と同じパターンで自動的にEXECUTEが
-- 付与される見込みであり、これは既存RPCと同じ既知の挙動として許容する
-- （静的レビュー・remote適用後に実際の付与状況を確認し、報告する）。
-- ALTER DEFAULT PRIVILEGESは使用しない。
-- =============================================================================
