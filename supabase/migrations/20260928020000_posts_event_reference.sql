-- =============================================================================
-- 20260928020000_posts_event_reference.sql
-- posts.event_id の参照整合性 (M18): post_type × event_id のCHECK、posts_insert_own の
--   event参照条件、posts(event_id) index
--
-- 対象: public.posts のCHECK制約1本の置換、RLS policy posts_insert_own の置換、
--   index 1本の追加のみ。events（table・RLS・列単位のSELECT権限・trigger）、M13〜M17の
--   function、posts の他のpolicy・ACL・列ACL・trigger、delete_own_post / moderate_post、
--   他table、default privilegeは変更しない。新しいhelper・trigger・RPCは作成しない。
--
-- 1. post_type × event_id のexact invariant（CHECK）
--   posts_live_report_requires_event_id_check（live_reportならevent_id必須のみ）を削除し、
--   posts_post_type_event_id_check に置換する:
--     post_type = 'normal'      -> event_id IS NULL
--     post_type = 'live_report' -> event_id IS NOT NULL
--   post_type の値の範囲は既存の posts_post_type_check（変更なし）が強制する。
--   このCHECKはeventの可視性を検査しない（event参照の可否はINSERTのRLSの責務）。
--   MVPでは live_report を「特定のLIVEに紐づく投稿」のDB上のpost typeとして扱う。
--   postsは0行のため既存データとの衝突はない。
--
-- 2. posts_insert_own の置換（event参照条件の追加）
--   従来の条件（author_id = auth.uid() / is_active_user() / status = 'published'）を
--   そのまま維持し、次の条件を追加する:
--     event_id IS NULL OR EXISTS (SELECT 1 FROM public.events AS e WHERE e.id = posts.event_id)
--   posts側は events.id のみを参照し、first_published_at は参照しない。EXISTS内のeventsには
--   呼び出し元（authenticated）のRLSが適用されるため、events_select_public（M11:
--   status='public'、または status='cancelled' かつ first_published_at IS NOT NULL）で
--   見えるeventだけが参照可能になる。draft・公開されたことのないcancelled・不存在は
--   0行となり、WITH CHECK違反（RLS違反）でINSERTが拒否される。event_date・blocks・
--   event_participants・profileの属性は参照可否に使わない。
--   参照可能になったeventは、削除不可（RESTRICT）・draftへの逆戻り不可（trigger・M17）
--   のため参照可能なまま変わらず、INSERT時の検査で足りる。service_role / postgres の
--   直接書き込みはRLSをbypassする（信頼された経路）。
--
-- 3. index
--   posts_event_id_idx ON public.posts (event_id)（将来の /live/[id] の関連投稿取得用）。
--
-- UPDATE policy・列単位のUPDATE権限（content / image_url のみ）は変更しないため、
--   post_type と event_id は作成後にclientから変更できない。
-- 001〜033は変更しない。
-- =============================================================================

alter table public.posts
  drop constraint posts_live_report_requires_event_id_check;

alter table public.posts
  add constraint posts_post_type_event_id_check
  check (
    (post_type = 'normal' and event_id is null)
    or (post_type = 'live_report' and event_id is not null)
  );

drop policy posts_insert_own on public.posts;

create policy posts_insert_own
  on public.posts
  for insert
  to authenticated
  with check (
    author_id = auth.uid()
    and public.is_active_user()
    and status = 'published'
    and (
      event_id is null
      or exists (
        select 1
        from public.events as e
        where e.id = posts.event_id
      )
    )
  );

create index posts_event_id_idx
  on public.posts (event_id);
