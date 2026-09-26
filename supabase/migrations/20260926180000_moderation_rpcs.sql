-- =============================================================================
-- 20260926180000_moderation_rpcs.sql
-- moderation RPCs - public.moderate_post() / public.moderate_comment()
--
-- 対象（本migrationに含まれるもの）:
--   - public.moderate_post(target_post_id uuid, new_status text, reason text default null)
--   - public.moderate_comment(target_comment_id uuid, new_status text, reason text default null)
--   - 上記2関数の必要最小限のACL（PUBLIC/anon REVOKE、authenticated GRANT）
--
-- 本migrationに含まれないもの:
--   - posts/comments/admin_logsのtable schema・RLS・policy・table ACL
--     （いずれも変更禁止・無変更）
--   - likes/reports/events/event_participants/news/songs/login_attempts/
--     app_settingsのRLS
--   - 新しいtrigger・index・rate limit・Storage・Next.jsコード
--
-- 20260920022832_core_schema.sql（001）〜20260926150000_admin_logs_rls.sql（014）
-- はいずれも変更しない。
--
-- -----------------------------------------------------------------------------
-- migration作成前に実施した実DB probe（BEGIN...ROLLBACKで完全に巻き戻し、
-- 恒久変更なし）の結果概要:
--   - 本migrationが作成する2関数と全く同一のbodyを一時的にCREATE FUNCTIONし、
--     30件の検証ケース（有効/無効transition、認可、atomicity failure
--     injection）すべてがPASSした。
--   - 最重要検証: admin_logsへのINSERTをtemporary triggerで意図的に失敗
--     させたところ、moderate_post()/moderate_comment()いずれも例外が
--     関数全体へ伝播し、posts/comments.statusへのUPDATEも自動的に
--     ロールバックされ、admin_logsにも孤立した行が作られないことを実証した
--     （関数内でEXCEPTIONを握り潰す処理を一切書いていないため、Postgresの
--     標準的な「関数呼び出し中の未捕捉例外は呼び出し全体を中断する」という
--     挙動により、追加のトランザクション制御コードなしでatomicityが
--     自然に保証される）。
--   - published→hidden・hidden→publishedのみが許可され、no-op
--     （published→published・hidden→hidden）およびdeletedに関わる全ての
--     transition（published/hidden→deleted、deleted→published/hidden/deleted）
--     はすべてINVALID_MODERATION_TRANSITIONで拒否されることを実証した。
--   - normal active/suspended/banned、admin suspended/banned、
--     auth.uid() IS NULLのいずれも、target lookup前のpublic.is_admin()
--     チェックでMODERATION_NOT_AUTHORIZEDとして拒否され、対象行のstatusも
--     admin_logsも一切変化しないことを実証した。anonはEXECUTE権限自体を
--     持たないためpermission deniedとなる。
-- -----------------------------------------------------------------------------


-- -----------------------------------------------------------------------------
-- public.moderate_post(target_post_id uuid, new_status text, reason text default null)
--
-- active adminのみが実行可能。許可されるstatus遷移はpublished→hiddenと
-- hidden→publishedのみ。no-op（同一status指定）およびdeletedに関わる遷移
-- （published/hidden→deleted、deleted→published/hidden/deleted）はすべて
-- 拒否する。deletedはself-delete専用のterminal statusであり、本関数からは
-- 一切変更できない。
--
-- 対象行はSELECT ... FOR UPDATEでロックしてから現在statusを確定し、
-- transition検証・status UPDATE・admin_logs INSERTを同一function
-- invocation内で行う。admin_logs INSERTが失敗した場合、この関数呼び出し
-- 全体が例外終了し、直前のUPDATEも含めて自動的にロールバックされる
-- （関数内にEXCEPTIONブロックを設けていないため、Postgresの標準動作に
-- よりatomicityが保証される）。
--
-- admin_idはauth.uid()から取得し、引数として受け取らない。reasonは任意
-- （NULL可）。前後の空白をtrimし、空文字列はNULLとして扱う。trim後500文字
-- を超える場合は拒否する。table schemaは変更しない。
--
-- non-adminのcallerは、対象の存在確認より前にauthorizationで拒否される
-- ため、target不存在・deleted・不正transitionの詳細をnon-adminへ漏らす
-- ことはない。active adminへのエラーも一般化されたコードのみを返す。
--
-- SECURITY DEFINER・owner=postgres・search_path=''。内部参照はすべて
-- fully-qualified。動的SQLは使用しない。
-- -----------------------------------------------------------------------------
create function public.moderate_post(
  target_post_id uuid,
  new_status text,
  reason text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current_status text;
  v_reason text;
begin
  if not public.is_admin() then
    raise exception 'MODERATION_NOT_AUTHORIZED';
  end if;

  if new_status not in ('published', 'hidden') then
    raise exception 'INVALID_MODERATION_TRANSITION';
  end if;

  v_reason := nullif(btrim(reason), '');
  if v_reason is not null and char_length(v_reason) > 500 then
    raise exception 'MODERATION_REASON_TOO_LONG';
  end if;

  select status
    into v_current_status
    from public.posts
    where id = target_post_id
    for update;

  if v_current_status is null then
    raise exception 'MODERATION_TARGET_NOT_AVAILABLE';
  end if;

  if v_current_status not in ('published', 'hidden') or v_current_status = new_status then
    raise exception 'INVALID_MODERATION_TRANSITION';
  end if;

  update public.posts
    set status = new_status
    where id = target_post_id;

  insert into public.admin_logs (admin_id, action, target_type, target_id, detail)
  values (
    auth.uid(),
    'moderate_post',
    'post',
    target_post_id,
    case when v_reason is null
      then jsonb_build_object('from_status', v_current_status, 'to_status', new_status)
      else jsonb_build_object('from_status', v_current_status, 'to_status', new_status, 'reason', v_reason)
    end
  );
end;
$$;

revoke execute on function public.moderate_post(uuid, text, text) from public;
revoke execute on function public.moderate_post(uuid, text, text) from anon;
grant execute on function public.moderate_post(uuid, text, text) to authenticated;


-- -----------------------------------------------------------------------------
-- public.moderate_comment(target_comment_id uuid, new_status text, reason text default null)
--
-- moderate_post()と同一の設計・authorization・transition規則・atomicity
-- 保証をcommentsに対して適用する。parent postのstatus/visibilityは一切
-- 参照・変更しない（comment moderationはcomment自身のstatusのみを対象と
-- する）。
-- -----------------------------------------------------------------------------
create function public.moderate_comment(
  target_comment_id uuid,
  new_status text,
  reason text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current_status text;
  v_reason text;
begin
  if not public.is_admin() then
    raise exception 'MODERATION_NOT_AUTHORIZED';
  end if;

  if new_status not in ('published', 'hidden') then
    raise exception 'INVALID_MODERATION_TRANSITION';
  end if;

  v_reason := nullif(btrim(reason), '');
  if v_reason is not null and char_length(v_reason) > 500 then
    raise exception 'MODERATION_REASON_TOO_LONG';
  end if;

  select status
    into v_current_status
    from public.comments
    where id = target_comment_id
    for update;

  if v_current_status is null then
    raise exception 'MODERATION_TARGET_NOT_AVAILABLE';
  end if;

  if v_current_status not in ('published', 'hidden') or v_current_status = new_status then
    raise exception 'INVALID_MODERATION_TRANSITION';
  end if;

  update public.comments
    set status = new_status
    where id = target_comment_id;

  insert into public.admin_logs (admin_id, action, target_type, target_id, detail)
  values (
    auth.uid(),
    'moderate_comment',
    'comment',
    target_comment_id,
    case when v_reason is null
      then jsonb_build_object('from_status', v_current_status, 'to_status', new_status)
      else jsonb_build_object('from_status', v_current_status, 'to_status', new_status, 'reason', v_reason)
    end
  );
end;
$$;

revoke execute on function public.moderate_comment(uuid, text, text) from public;
revoke execute on function public.moderate_comment(uuid, text, text) from anon;
grant execute on function public.moderate_comment(uuid, text, text) to authenticated;

-- service_role/postgresへは新たなGRANT/REVOKEを行わない。CREATE FUNCTIONの
-- default privilege（postgres所有・publicスキーマ）により、postgres・
-- service_roleへは既存のdelete_own_post()等と同じパターンで自動的に
-- EXECUTEが付与される見込みであり、これは既存RPCと同じ既知の挙動として
-- 許容する（静的レビュー・remote適用後に実際の付与状況を確認し、報告する）。
-- ALTER DEFAULT PRIVILEGESは使用しない。
-- =============================================================================
