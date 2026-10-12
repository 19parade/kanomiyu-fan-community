-- =============================================================================
-- 20261012120000_bidirectional_block_posts_comments_likes.sql
-- F5-C1 migration C: posts/comments/likes RLSとcreate_report()のブロック判定を
--   一方向（viewer→author）から双方向（internal.is_blocked_with()）へ統一する
--
-- 対象（本migrationに含まれるもの、既存定義を drop policy / create or
--   replace function で置き換える。表の新規作成・列追加・index追加は
--   一切行わない）:
--   policy（table-level。名称はすべて既存のまま変更しない）:
--     - public.posts    : posts_select_visible_authenticated
--     - public.comments : comments_select_visible_authenticated
--                         comments_insert_own
--                         comments_update_own
--     - public.likes    : likes_select_visible_authenticated
--                         likes_insert_own
--   function（signature・戻り値型・SECURITY DEFINER・search_pathは維持。
--     GRANT/REVOKEは行わない。既存のfix_moderation_null_status.sqlと同じ
--     「CREATE OR REPLACEのみでACLは変更しない」方針）:
--     - public.create_report(text, uuid, text, text)
--
-- 本migrationに含まれないもの:
--   - anon向けpolicy（posts_select_public_anon / comments_select_public_anon /
--     likes_select_public_anon）。PM確定方針「ログイン中の会員間」の対象外の
--     ため無変更。anonにはこれまで通りblock概念を適用しない。
--   - posts_select_own / posts_select_admin / comments_select_own /
--     comments_select_admin / likes_select_own / likes_delete_own /
--     posts_update_own / posts_insert_own（後述「変更しない理由」参照）。
--   - delete_own_post() / delete_own_comment()（block判定を一切含まない
--     ため変更不要。後述）。
--   - moderate_post() / moderate_comment() / process_report() /
--     get_my_reports()（block判定を含まないため変更不要）。
--   - internal.is_blocked_with() / internal.is_community_browsing_allowed() /
--     public.is_admin() / public.is_active_user()（変更禁止・無変更）。
--   - public.blocks のtable・RLS・ACL（既存のまま。blocks_select_own等は
--     F4で確定済み、本migrationでは一切変更しない）。
--   - 既存48件＋migration A・B。
--
-- -----------------------------------------------------------------------------
-- 「既存7ポリシーを機械的に置換するだけで済むと決めつけない」確認結果
-- -----------------------------------------------------------------------------
-- F5-B §3では一方向block判定箇所を「7ポリシー」と数えたが、元のSQL定義を
-- 1つずつ再確認した結果、実際に変更が必要な箇所は以下の6ポリシー＋
-- create_report()であることを確認した（posts_insert_ownはF5-B時点でも
-- 対象外と識別済みだったが、念のため全postgres policyを再読した上で
-- 以下の通り最終確認する）。
--
--   - posts_select_visible_authenticated: block条件1箇所（viewer→author）。
--   - comments_select_visible_authenticated: block条件2箇所
--     （viewer→親postのauthor、viewer→comment自身のauthor）。
--   - comments_insert_own: block条件1箇所（viewer→親postのauthor）。
--   - comments_update_own: USING句とWITH CHECK句の双方に同一のblock条件が
--     それぞれ独立して重複記述されている（計2箇所、内容は同一）。
--   - likes_select_visible_authenticated: block条件1箇所（viewer→親postの
--     author）。
--   - likes_insert_own: block条件1箇所（viewer→親postのauthor、WITH CHECK内）。
--
-- 以下は元のSQL定義を確認した結果、block条件を一切含まないため本migrationの
-- 対象外であることを確認した:
--   - posts_select_own / posts_select_admin / posts_update_own /
--     posts_insert_own: author_id=auth.uid() / is_admin() / is_active_user() /
--     status条件のみで、blockへの参照が一切ない。posts_insert_ownは
--     自分自身をauthorとして作成するだけなので、そもそもblock判定という
--     概念が成立しない（自己ブロックはblocks_no_self_block_check CHECK制約で
--     別途防止済み・無関係）。
--   - comments_select_own / comments_select_admin / likes_select_own /
--     likes_delete_own: author_id=auth.uid() / user_id=auth.uid() /
--     is_admin()のみで、blockへの参照が一切ない。
--   - delete_own_post() / delete_own_comment(): author_id=auth.uid()と
--     statusのみを条件とし、呼び出し者のprofile status・block関係のいずれも
--     参照しない（F5-A §3で確認済み、PM確定仕様「縮小操作は常に許可」）。
--     したがって本migrationによる双方向化は自分の投稿・コメントの削除権限に
--     一切影響しない。
--
-- -----------------------------------------------------------------------------
-- 重要な指摘: comments_update_own への影響（「本人の編集/削除権限を不当に
-- 失わせない」要件との関係）
-- -----------------------------------------------------------------------------
-- comments_update_own のblock条件は「コメント投稿者（=author_id=auth.uid()、
-- 常に自分自身）が、親postのauthorとblock関係にないこと」を要求する。
-- 旧仕様（一方向）では「自分が親post authorをblockしている」場合のみ
-- 条件が不成立になったが、双方向化後は「親post authorが自分をblockした」
-- 場合にも新たに条件が不成立になる。すなわち、第三者（親postの著者）が
-- 一方的にblockという操作を行っただけで、既に投稿済みの自分のコメントを
-- 編集する権限が失われるという、新しい制限が発生する。
--
-- これは本migrationで新たに発生する挙動変化であり、PMが要求した「本人の
-- 投稿・コメントの編集/削除権限を不当に失わせない」という要件との関係を
-- 明示的に報告する必要があると判断し、ここに記録する。ただし以下の理由により
-- 許容範囲内と考える:
--   (1) 削除（delete_own_comment()）は上記の通りblock判定を一切参照しない
--       ため、この新しい制限の影響を受けない。ユーザーは常に自分のコメントを
--       削除できる「縮小操作」の権利を失わない。
--   (2) 親postの状態（published→hidden/deleted）が変化した場合も、既存
--       仕様として同様にcomments_update_ownの編集権限が失われる
--       （comments_rls.sql確定仕様）。block関係の変化は、この既存の
--       「親postの文脈が変化すると編集権限も連動する」という設計の延長線上
--       にある挙動であり、新しいカテゴリの制限ではない。
--   (3) 編集不可になっても自分のコメントの閲覧（comments_select_own）は
--       block状態に関わらず常に可能なままである。
-- 上記の整理が妥当かどうかはPM判断を仰ぐ（最終報告に記載）。
--
-- -----------------------------------------------------------------------------
-- RLS循環参照・再帰の確認
-- -----------------------------------------------------------------------------
-- internal.is_blocked_with(uuid) は public.blocks への単純なSELECTのみを
-- 行い、public.posts / public.comments / public.likes / public.profiles の
-- いずれも参照しない（F5-A §3で確認済み、内容は本migrationで一切変更しない）。
-- したがって、posts/comments/likesのRLS policyやcreate_report()から
-- 本関数を呼び出しても、循環参照・再帰は一切発生しない。
--
-- -----------------------------------------------------------------------------
-- active/suspended/bannedの既存権限・anon閲覧ポリシーについて
-- -----------------------------------------------------------------------------
-- internal.is_community_browsing_allowed()（active/suspended→true、
-- banned→false）の呼び出し箇所・ロジックは一切変更しない。双方向化後も
-- bannedはこれまで通り posts_select_visible_authenticated 等に到達しない。
-- anon向けpolicy（*_select_public_anon）は本migrationの対象外であり、
-- 匿名訪問者の閲覧範囲・挙動は一切変化しない。
--
-- -----------------------------------------------------------------------------
-- 投稿一覧・詳細・コメント・いいね・通報の可視性整合性
-- -----------------------------------------------------------------------------
-- posts_select_visible_authenticated（一覧・詳細共通の唯一のfan-facing
-- SELECT policy）、comments_select_visible_authenticated、
-- likes_select_visible_authenticated、create_report()のpost/comment
-- 可視性判定を同一migration内で一括して双方向化するため、「一覧には
-- 出ないがURL直打ちで詳細は見える」「投稿は見えるがいいね数だけ古い
-- 判定のまま」「可視性は双方向化されたが通報対象判定は一方向のまま」
-- といった不整合は発生しない。
--
-- -----------------------------------------------------------------------------
-- GRANT差分
-- -----------------------------------------------------------------------------
-- 本migrationはpolicy定義とfunction本体のみを変更し、いかなる
-- GRANT/REVOKE文も含まない。drop policy後のcreate policyは同一の
-- `to authenticated` ロール指定を維持し、create or replace function は
-- 既存のACL（PUBLIC REVOKE・authenticated GRANT、
-- 20260927120000_create_report_rpc.sqlで確定済み）に一切影響しない
-- （20260927160000_fix_moderation_null_status.sqlと同一の前提）。
--
-- 本migrationは静的SQLレビューのみを行っており、検証プロジェクトへの
-- db push・BEGIN/ROLLBACKを伴うDDL probeは実施していない。
-- 既存48件＋migration A・Bはいずれも変更しない。
-- =============================================================================


-- -----------------------------------------------------------------------------
-- public.posts: posts_select_visible_authenticated を双方向block判定へ
-- -----------------------------------------------------------------------------
drop policy posts_select_visible_authenticated on public.posts;

create policy posts_select_visible_authenticated
  on public.posts
  for select
  to authenticated
  using (
    status = 'published'
    and internal.is_community_browsing_allowed()
    and not internal.is_blocked_with(posts.author_id)
  );


-- -----------------------------------------------------------------------------
-- public.comments: comments_select_visible_authenticated を双方向block判定へ
-- （親postのauthor・comment自身のauthorの双方）
-- -----------------------------------------------------------------------------
drop policy comments_select_visible_authenticated on public.comments;

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
        and not internal.is_blocked_with(p.author_id)
    )
    and not internal.is_blocked_with(comments.author_id)
  );


-- -----------------------------------------------------------------------------
-- public.comments: comments_insert_own を双方向block判定へ（親postのauthor）
-- -----------------------------------------------------------------------------
drop policy comments_insert_own on public.comments;

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
        and not internal.is_blocked_with(p.author_id)
    )
  );


-- -----------------------------------------------------------------------------
-- public.comments: comments_update_own を双方向block判定へ
-- （USING / WITH CHECK 双方の重複条件を同じ内容で置き換える）
-- -----------------------------------------------------------------------------
drop policy comments_update_own on public.comments;

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
        and not internal.is_blocked_with(p.author_id)
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
        and not internal.is_blocked_with(p.author_id)
    )
  );


-- -----------------------------------------------------------------------------
-- public.likes: likes_select_visible_authenticated を双方向block判定へ
-- -----------------------------------------------------------------------------
drop policy likes_select_visible_authenticated on public.likes;

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
        and not internal.is_blocked_with(p.author_id)
    )
  );


-- -----------------------------------------------------------------------------
-- public.likes: likes_insert_own を双方向block判定へ
-- -----------------------------------------------------------------------------
drop policy likes_insert_own on public.likes;

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
        and not internal.is_blocked_with(p.author_id)
    )
  );


-- -----------------------------------------------------------------------------
-- public.create_report(): post/comment分岐のblock判定を双方向へ
-- （profile分岐は既にinternal.is_blocked_with()を使用しており変更不要）。
-- CREATE OR REPLACEのため、signature / 戻り値 / owner / SECURITY DEFINER /
-- search_path / language / ACL は維持される（GRANT/REVOKEは行わない。
-- 20260927160000_fix_moderation_null_status.sqlと同一方針）。重複防止
-- （reports_reporter_target_key UNIQUE制約のcatch）・レート制限
-- （internal.enforce_report_rate_limit() trigger、本migrationでは一切
-- 変更しない）・自己通報防止（SELF_REPORT_NOT_ALLOWED）のロジックは
-- 一切変更しない。
-- -----------------------------------------------------------------------------
create or replace function public.create_report(
  target_type text,
  target_id uuid,
  reason text,
  detail text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reporter_id uuid := auth.uid();
  v_detail text;
  v_target_author_id uuid;
  v_found boolean;
  v_report_id uuid;
  v_constraint text;
begin
  if v_reporter_id is null or not public.is_active_user() then
    raise exception 'REPORT_NOT_AUTHORIZED';
  end if;

  if create_report.target_type is null
     or create_report.target_type not in ('profile', 'post', 'comment') then
    raise exception 'INVALID_REPORT_TARGET_TYPE';
  end if;

  if create_report.reason is null
     or create_report.reason not in (
       'defamation', 'threats', 'discrimination', 'harassment',
       'personal_info_exposure', 'impersonation', 'fraud', 'ticket_scalping',
       'illegal_activity', 'unauthorized_repost', 'copyright_infringement',
       'full_lyrics_posting', 'unauthorized_media_posting', 'spam',
       'dating_solicitation', 'other'
     ) then
    raise exception 'INVALID_REPORT_REASON';
  end if;

  -- 両端の空白類（U+0020, tab, LF, CR, U+3000）を除去。内部は保持。
  v_detail := nullif(
    btrim(create_report.detail, chr(32) || chr(9) || chr(10) || chr(13) || chr(12288)),
    ''
  );

  if v_detail is not null and char_length(v_detail) > 2000 then
    raise exception 'REPORT_DETAIL_TOO_LONG';
  end if;

  if create_report.target_id is null then
    raise exception 'REPORT_TARGET_NOT_AVAILABLE';
  end if;

  if create_report.target_type = 'post' then
    select p.author_id
      into v_target_author_id
      from public.posts p
      where p.id = create_report.target_id
        and p.status = 'published'
        and not internal.is_blocked_with(p.author_id);
    v_found := found;

    if not v_found then
      raise exception 'REPORT_TARGET_NOT_AVAILABLE';
    end if;
    if v_target_author_id = v_reporter_id then
      raise exception 'SELF_REPORT_NOT_ALLOWED';
    end if;

  elsif create_report.target_type = 'comment' then
    select c.author_id
      into v_target_author_id
      from public.comments c
      join public.posts p on p.id = c.post_id
      where c.id = create_report.target_id
        and c.status = 'published'
        and p.status = 'published'
        and not internal.is_blocked_with(p.author_id)
        and not internal.is_blocked_with(c.author_id);
    v_found := found;

    if not v_found then
      raise exception 'REPORT_TARGET_NOT_AVAILABLE';
    end if;
    if v_target_author_id = v_reporter_id then
      raise exception 'SELF_REPORT_NOT_ALLOWED';
    end if;

  else
    if create_report.target_id = v_reporter_id then
      raise exception 'SELF_REPORT_NOT_ALLOWED';
    end if;

    select exists (
      select 1
      from public.profiles pr
      where pr.id = create_report.target_id
        and pr.status in ('active', 'suspended')
        and not internal.is_blocked_with(pr.id)
    ) into v_found;

    if not v_found then
      raise exception 'REPORT_TARGET_NOT_AVAILABLE';
    end if;
  end if;

  begin
    insert into public.reports (reporter_id, target_type, target_id, reason, detail)
    values (
      v_reporter_id,
      create_report.target_type,
      create_report.target_id,
      create_report.reason,
      v_detail
    )
    returning id into v_report_id;
  exception
    when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint = 'reports_reporter_target_key' then
        raise exception 'REPORT_ALREADY_EXISTS';
      end if;
      raise;
  end;

  return v_report_id;
end;
$$;
-- =============================================================================
