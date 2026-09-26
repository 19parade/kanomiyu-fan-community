-- =============================================================================
-- 20260926120000_comments_rls.sql
-- comments RLS - RLS ENABLE + 最小権限GRANT/REVOKE + delete_own_comment()
--
-- 対象（本migrationに含まれるもの）:
--   - public.comments: anon/authenticatedのtable-level ACL最小化
--   - public.comments: authenticatedへのcolumn-level UPDATE GRANT（contentのみ）
--   - public.comments: ENABLE ROW LEVEL SECURITY（FORCE RLSは使用しない）
--   - policy 6件: comments_select_public_anon / comments_select_visible_authenticated /
--     comments_select_own / comments_select_admin / comments_insert_own / comments_update_own
--   - public.delete_own_comment(target_comment_id uuid): self-delete用SECURITY DEFINER RPC
--
-- 本migrationに含まれないもの:
--   - posts/profiles/blocks（いずれも変更禁止・無変更）
--   - moderate_post()/moderate_comment()
--   - likes/reports/event_participants/admin_logsのRLS
--   - internal.is_community_browsing_allowed() / internal.is_blocked_with() /
--     public.is_admin() / public.is_active_user() / internal schema ACL（変更禁止・無変更）
--   - 新しいSECURITY DEFINER helper・index・rate limit・Storage・Next.jsコード
--
-- 20260920022832_core_schema.sql（001）〜20260926090000_posts_rls.sql（012）
-- はいずれも変更しない。
--
-- -----------------------------------------------------------------------------
-- migration作成前に実施した実DB probe（BEGIN...ROLLBACKで完全に巻き戻し、
-- 恒久変更なし）の結果概要:
--   - 本migrationが作成する4つのSELECT policy・INSERT policy・UPDATE policyの
--     SQLを、実際のpublic.commentsテーブルへ一時的にENABLE RLS + CREATE POLICY
--     した上でそのまま実行し、45件の検証ケースすべてがPASSした。
--   - 最も重要な検証: adminが直接public.postsをSELECTするとposts_select_admin
--     により hidden/deleted parentも見える状態であっても、本migrationの
--     fan-facing用EXISTSサブクエリに明示した `p.status = 'published'` という
--     追加条件は、posts側のRLSが許可する可視範囲をさらに絞り込む
--     （AND結合される）ため、hidden/deleted parentがこのEXISTSを通過する
--     ことは一切ない（admin callerであっても同様）。これによりcomments側で
--     新しいSECURITY DEFINER helperを作らず、直接EXISTS方式のみで
--     fan-facing visibilityを安全に実装できることを確認した。
--   - block判定はviewer-centricな一方向のみ（A→B/A→Cで不可視、B→A/C→Aの
--     reverse-onlyでは可視、third-party間のblockは無関係）であることを
--     実地で確認した。`internal.is_blocked_with()`（双方向）は使用しない。
--   - self visibility（comments_select_own相当）が親postのstatusから完全に
--     独立していることを、9通りのcomment-status×parent-status組み合わせ
--     全件と、banned callerでの代表ケースで確認した。
--   - INSERT/UPDATE候補条件（parent published必須・parent fan-facing可視
--     必須・comment.status=published必須・active本人限定）についても
--     実際のINSERT/UPDATE文で検証済み。
-- -----------------------------------------------------------------------------


-- -----------------------------------------------------------------------------
-- anon: commentsへの全権限を明示的にREVOKEしてから、SELECTのみを再付与する。
-- column-level UPDATEは一切付与しない。
-- -----------------------------------------------------------------------------
revoke all on table public.comments from anon;

grant select
  on table public.comments
  to anon;


-- -----------------------------------------------------------------------------
-- authenticated: 広いtable-level権限を一度すべて取り消してから、
-- SELECT/INSERTのみを再付与し、UPDATEはcontent列のみをcolumn-level GRANTで
-- 許可する。id/post_id/author_id/status/created_at/updated_atはこの1列に
-- 含まれないため直接UPDATE不可のまま。
-- -----------------------------------------------------------------------------
revoke all on table public.comments from authenticated;

grant select, insert
  on table public.comments
  to authenticated;

grant update (content)
  on table public.comments
  to authenticated;


-- -----------------------------------------------------------------------------
-- RLSを有効化する。FORCE ROW LEVEL SECURITYは使用しない
-- （owner=postgresはBYPASSRLSのため、delete_own_comment()の内部UPDATEに
-- 影響しない）。
-- -----------------------------------------------------------------------------
alter table public.comments enable row level security;


-- -----------------------------------------------------------------------------
-- comments_select_public_anon: anonはpublishedコメントかつ親postがpublished
-- の場合のみSELECT可能。anonにはblockという概念が存在しないため条件に
-- 含めない。
-- -----------------------------------------------------------------------------
create policy comments_select_public_anon
  on public.comments
  for select
  to anon
  using (
    comments.status = 'published'
    and exists (
      select 1
      from public.posts p
      where p.id = comments.post_id
        and p.status = 'published'
    )
  );


-- -----------------------------------------------------------------------------
-- comments_select_visible_authenticated: authenticatedのfan-facing可視性。
-- community browsing可否は internal.is_community_browsing_allowed() で判定
-- する。親postについては「published かつ viewerがpost authorをblockして
-- いない」という条件を、posts_select_own/posts_select_adminに一切依存せず
-- 明示的なEXISTSサブクエリとして記述する（migration作成前probeで実証済み。
-- posts側でadminにhidden/deleted parentが見えている状態でも、この
-- p.status='published'条件がAND結合されるため通過しない）。comment
-- author側についても、viewerがcomment authorをblockしていないことを
-- 別途明示的に確認する。いずれも一方向（viewer→対象）のみで、
-- internal.is_blocked_with()（双方向）は使用しない。
-- -----------------------------------------------------------------------------
create policy comments_select_visible_authenticated
  on public.comments
  for select
  to authenticated
  using (
    comments.status = 'published'
    and internal.is_community_browsing_allowed()
    and exists (
      select 1
      from public.posts p
      where p.id = comments.post_id
        and p.status = 'published'
        and not exists (
          select 1
          from public.blocks b
          where b.blocker_id = auth.uid()
            and b.blocked_id = p.author_id
        )
    )
    and not exists (
      select 1
      from public.blocks b
      where b.blocker_id = auth.uid()
        and b.blocked_id = comments.author_id
    )
  );


-- -----------------------------------------------------------------------------
-- comments_select_own: 本人は自分のcommentsをstatusに関わらず（published/
-- hidden/deletedいずれも）、かつ親postのstatusに関わらずSELECT可能。
-- is_active_user()・is_community_browsing_allowed()・親post参照はいずれも
-- 行わない。したがってactive/suspended/banned問わず、本人は常に自分の
-- commentsを閲覧できる（親postがhidden/deletedになっていても影響しない）。
-- -----------------------------------------------------------------------------
create policy comments_select_own
  on public.comments
  for select
  to authenticated
  using (
    author_id = auth.uid()
  );


-- -----------------------------------------------------------------------------
-- comments_select_admin: active adminはmoderation用途としてbase tableから
-- 全author・全status・親postのstatusに関係なく全commentsをSELECT可能。
-- 本policyはfan-facing visibilityを表すものではない。対応するUPDATE/DELETE
-- policyは作成しない。
-- -----------------------------------------------------------------------------
create policy comments_select_admin
  on public.comments
  for select
  to authenticated
  using (
    public.is_admin()
  );


-- -----------------------------------------------------------------------------
-- comments_insert_own: active本人のみ、自分をauthorとして、published状態の
-- commentを、published状態かつfan-facingで可視な親postに対してのみINSERT
-- 可能。comment authorはcaller自身なのでcomment-author側のblock判定は
-- 不要（重複追加しない）。親postについてはpost-author側のblock判定
-- （viewer→post author一方向）のみを明示的に確認する。
-- -----------------------------------------------------------------------------
create policy comments_insert_own
  on public.comments
  for insert
  to authenticated
  with check (
    author_id = auth.uid()
    and public.is_active_user()
    and status = 'published'
    and exists (
      select 1
      from public.posts p
      where p.id = comments.post_id
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
-- comments_update_own: active本人が自分のpublished commentのみUPDATE可能。
-- 親postがpublishedかつfan-facingで可視であることも要求するため、親postが
-- 後からhidden/deletedになった場合は、comment author本人でも通常content
-- 編集は不可になる（self SELECTとself-delete RPCは影響を受けない、別
-- policy/別関数のため）。USING/WITH CHECK双方に同一条件を明示し、
-- column-level GRANT（contentのみ）との二重防御とする。admin用のUPDATE
-- policyは作成しない。
-- -----------------------------------------------------------------------------
create policy comments_update_own
  on public.comments
  for update
  to authenticated
  using (
    author_id = auth.uid()
    and public.is_active_user()
    and comments.status = 'published'
    and exists (
      select 1
      from public.posts p
      where p.id = comments.post_id
        and p.status = 'published'
        and not exists (
          select 1
          from public.blocks b
          where b.blocker_id = auth.uid()
            and b.blocked_id = p.author_id
        )
    )
  )
  with check (
    author_id = auth.uid()
    and public.is_active_user()
    and comments.status = 'published'
    and exists (
      select 1
      from public.posts p
      where p.id = comments.post_id
        and p.status = 'published'
        and not exists (
          select 1
          from public.blocks b
          where b.blocker_id = auth.uid()
            and b.blocked_id = p.author_id
        )
    )
  );

-- DELETE policyは作成しない。commentsの物理DELETEはanon/authenticated
-- いずれにも許可しない（table-level DELETE privilege自体を上記REVOKEにより
-- 保持していない）。


-- -----------------------------------------------------------------------------
-- public.delete_own_comment(target_comment_id uuid): self-delete用RPC。
--
-- 認可条件はauthor_id = auth.uid()のみで、caller自身のprofile statusは
-- 確認しない（active/suspended/banned問わず、縮小操作として許可する
-- というPM確定仕様）。親postのstatus/可視性も一切参照しない
-- （親postがhidden/deletedであっても自分のcommentをself-delete可能）。
-- 許可されるstatus遷移はpublished→deletedおよびhidden→deletedのみで、
-- 既にdeletedな行は対象から除外されるためUPDATE 0件となり、エラーには
-- せず成功扱いで返す（冪等）。deletedからの復帰経路はこの関数に一切
-- 実装しない。
--
-- 他人所有のcomment・不存在のUUIDについても、対象行が0件になるという
-- 同一の結果を返すのみで、これらを区別する例外・戻り値は設けない
-- （existence oracle対策）。auth.uid()がNULLの場合はauthor_id=auth.uid()
-- が常にfalseとなり、どの行も更新されない。
--
-- SECURITY DEFINER・owner=postgres・search_path=''。内部参照はすべて
-- fully-qualified。既存のcomments_set_updated_at trigger（BEFORE UPDATE →
-- public.set_updated_at()）は変更せず、そのまま利用する。
-- -----------------------------------------------------------------------------
create function public.delete_own_comment(target_comment_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.comments
  set status = 'deleted'
  where id = target_comment_id
    and author_id = auth.uid()
    and status in ('published', 'hidden');
$$;

revoke execute on function public.delete_own_comment(uuid) from public;
revoke execute on function public.delete_own_comment(uuid) from anon;
grant execute on function public.delete_own_comment(uuid) to authenticated;

-- service_role/postgresへは新たなGRANT/REVOKEを行わない。CREATE FUNCTIONの
-- default privilege（postgres所有・publicスキーマ）により、postgres・
-- service_roleへは既存のdelete_own_post()等と同じパターンで自動的に
-- EXECUTEが付与される見込みであり、これは既存RPCと同じ既知の挙動として
-- 許容する（静的レビュー・remote適用後に実際の付与状況を確認し、報告する）。
-- ALTER DEFAULT PRIVILEGESは使用しない。
-- =============================================================================
