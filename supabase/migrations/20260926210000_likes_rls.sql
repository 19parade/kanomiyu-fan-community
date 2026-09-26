-- =============================================================================
-- 20260926210000_likes_rls.sql
-- likes RLS - RLS ENABLE + 最小権限GRANT/REVOKE
--
-- 対象（本migrationに含まれるもの）:
--   - public.likes: anon/authenticatedのtable-level ACL最小化
--   - public.likes: ENABLE ROW LEVEL SECURITY（FORCE RLSは使用しない）
--   - policy 5件: likes_select_public_anon / likes_select_visible_authenticated /
--     likes_select_own / likes_insert_own / likes_delete_own
--
-- 本migrationに含まれないもの:
--   - likes用RPC（今回は作らない。unlikeは直接DELETEで行う）
--   - posts/comments/profiles/blocks/admin_logs（いずれも変更禁止・無変更）
--   - public.is_admin() / public.is_active_user() /
--     internal.is_community_browsing_allowed() / internal.is_blocked_with()
--     （変更禁止・無変更）
--   - PROJECT_SPEC.md（変更禁止）
--   - schema変更（列追加・制約変更・index変更・trigger追加はいずれも行わない）
--
-- 20260920022832_core_schema.sql（001）〜20260926180000_moderation_rpcs.sql（015）
-- はいずれも変更しない。
--
-- -----------------------------------------------------------------------------
-- migration作成前に実施した実DB probe（BEGIN...ROLLBACKで完全に巻き戻し、
-- 恒久変更なし）の結果概要:
--   - 本migrationが作成する5つのpolicyと全く同一のSQLを、実際の
--     public.likesテーブルへ一時的にENABLE RLS + CREATE POLICYした上で
--     そのまま実行し、46件の検証ケースすべてがPASSした。
--   - 最重要検証（PROJECT_SPEC.md v1.18の確定仕様）:
--     * fan-facing visibility（anon/authenticated）は親postのvisibility
--       （status='published'・community browsing可否・viewer→post-author
--       一方向block）に従い、hidden/deleted parentのlikesは不可視。
--     * own-like SELECT（likes_select_own: user_id=auth.uid()のみ）は、
--       親postのstatus/visibility、caller自身のprofiles.status
--       （active/suspended/banned）、viewer→post-author blockのいずれにも
--       依存せず、常にいいねをした本人が自分のlike行を確認できることを
--       実証した。
--     * post authorには、自分の投稿に紐づく他人のlikesを閲覧する特別な
--       policyを一切作成していないため、hidden/deleted parentについて
--       post authorが他人のlike行をSELECTできないことを実証した
--       （post author自身がlike ownerである場合は、そのself-likeのみ
--       ownpolicyで見える）。activeAdminについても同様に、特別な
--       admin用SELECT/DELETE policyを作成していないため、他人のlikeへの
--       特別アクセス権は一切存在しない。
--     * unlike（likes_delete_own: user_id=auth.uid()のみ）も同様に、
--       親postのstatus/visibility・caller自身のprofiles.status・block
--       のいずれにも依存せず、常に本人が自分のlikeを削除できることを
--       実証した。他人のlike行は、admin含め本人以外は削除できない。
--     * 新規like（INSERT）はactive本人・published状態かつfan-facingで
--       閲覧可能な親postに対してのみ許可され、hidden/deleted parent・
--       suspended/banned caller・他人へのuser_id偽装・重複（UNIQUE
--       制約）はいずれも拒否されることを実証した。
--   - block判定はいずれもviewer→post-author一方向のみで、
--     internal.is_blocked_with()（双方向）は使用していない。
-- -----------------------------------------------------------------------------


-- -----------------------------------------------------------------------------
-- anon: likesへの全権限を明示的にREVOKEしてから、SELECTのみを再付与する。
-- column-level UPDATEは一切付与しない。
-- -----------------------------------------------------------------------------
revoke all on table public.likes from anon;

grant select
  on table public.likes
  to anon;


-- -----------------------------------------------------------------------------
-- authenticated: 広いtable-level権限を一度すべて取り消してから、
-- SELECT/INSERT/DELETEのみを再付与する。UPDATEは許可しない
-- （likesはlike=INSERT・unlike=DELETEで完結し、UPDATEという操作概念を
-- 持たないため。column-level UPDATE GRANTも行わない）。
-- -----------------------------------------------------------------------------
revoke all on table public.likes from authenticated;

grant select, insert, delete
  on table public.likes
  to authenticated;


-- -----------------------------------------------------------------------------
-- RLSを有効化する。FORCE ROW LEVEL SECURITYは使用しない
-- （owner=postgresはBYPASSRLSのため、既存機能への影響はない。likes用の
-- SECURITY DEFINER RPCは今回作成しない）。
-- -----------------------------------------------------------------------------
alter table public.likes enable row level security;


-- -----------------------------------------------------------------------------
-- likes_select_public_anon: anonは親postがpublishedのlikesのみSELECT可能。
-- 目的は公開投稿のいいね件数・一覧表示。anonにはblockという概念が存在
-- しないため条件に含めない。
-- -----------------------------------------------------------------------------
create policy likes_select_public_anon
  on public.likes
  for select
  to anon
  using (
    exists (
      select 1
      from public.posts p
      where p.id = likes.post_id
        and p.status = 'published'
    )
  );


-- -----------------------------------------------------------------------------
-- likes_select_visible_authenticated: authenticatedのfan-facing可視性。
-- community browsing可否は internal.is_community_browsing_allowed() で
-- 判定する（active/suspended→true、banned→false）。親postについては
-- 「published かつ viewerがpost authorをblockしていない」という条件を、
-- posts_select_own/posts_select_adminに一切依存せず明示的なEXISTS
-- サブクエリとして記述する（posts/comments RLS実装時に確立した設計を
-- 踏襲。posts側でadminにhidden/deleted parentが見えている状態でも、
-- この p.status='published' 条件がAND結合されるため通過しない）。
-- block判定は一方向（viewer→post author）のみで、双方向helperの
-- internal.is_blocked_with()は使用しない。likeしたuser自身とviewer間の
-- blockはこのpolicyの条件に含めない（PROJECT_SPEC.md v1.18確定仕様。
-- likes rowはpost reactionとしてpost visibilityにのみ従う）。
-- -----------------------------------------------------------------------------
create policy likes_select_visible_authenticated
  on public.likes
  for select
  to authenticated
  using (
    internal.is_community_browsing_allowed()
    and exists (
      select 1
      from public.posts p
      where p.id = likes.post_id
        and p.status = 'published'
        and not exists (
          select 1
          from public.blocks b
          where b.blocker_id = auth.uid()
            and b.blocked_id = p.author_id
        )
    )
  );


-- -----------------------------------------------------------------------------
-- likes_select_own: いいねをした本人（user_id = auth.uid()）は、親postの
-- status/visibility、本人のprofiles.status（active/suspended/banned）、
-- viewer→post-author blockのいずれにも関わらず、常に自分のlike行を
-- SELECT可能（PROJECT_SPEC.md v1.18確定仕様）。親post参照・caller
-- status条件はいずれも追加しない。post authorには他人のlikesを閲覧する
-- 特別な権限を与えない（本policyの対象はlikeした本人のみ）。
-- -----------------------------------------------------------------------------
create policy likes_select_own
  on public.likes
  for select
  to authenticated
  using (
    user_id = auth.uid()
  );


-- -----------------------------------------------------------------------------
-- likes_insert_own: active本人のみ、自分をuser_idとして、fan-facingで
-- 閲覧可能なpublished状態の親postに対してのみINSERT可能。親postの
-- 判定はlikes_select_visible_authenticatedと同様の直接EXISTS方式を
-- 用いる。post authorとのblock判定も一方向（viewer→post author）の
-- みで、reverse-only・第三者間のblockは影響しない。likeするuser自身が
-- caller本人であるため、like対象userに対するblock判定は不要（重複追加
-- しない）。
-- -----------------------------------------------------------------------------
create policy likes_insert_own
  on public.likes
  for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and public.is_active_user()
    and exists (
      select 1
      from public.posts p
      where p.id = likes.post_id
        and p.status = 'published'
        and not exists (
          select 1
          from public.blocks b
          where b.blocker_id = auth.uid()
            and b.blocked_id = p.author_id
        )
    )
  );


-- -----------------------------------------------------------------------------
-- likes_delete_own: 本人（user_id = auth.uid()）は自分のlikeをunlike
-- （物理DELETE）できる。親postのstatus/visibility、本人のprofiles.status、
-- blockのいずれにも依存しない（PROJECT_SPEC.md v1.18確定仕様。自分の
-- リアクションの撤回は常に可能）。他人のlikeは本人以外（activeAdminを
-- 含め）削除できない。admin用の特別なDELETE policyは作成しない。
-- -----------------------------------------------------------------------------
create policy likes_delete_own
  on public.likes
  for delete
  to authenticated
  using (
    user_id = auth.uid()
  );

-- UPDATE policyは作成しない。likes rowをUPDATEするユースケースは存在
-- しない（id/post_id/user_id/created_atいずれも変更不可）。table-level
-- UPDATE privilege自体を上記REVOKEにより保持していない。
-- =============================================================================
