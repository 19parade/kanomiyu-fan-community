-- =============================================================================
-- 20260927160000_fix_moderation_null_status.sql
-- moderate_post() / moderate_comment() の new_status NULL検証の修正 (M8)
--
-- 問題: 既存の検証 `new_status not in ('published', 'hidden')` は、new_status が
--   NULL の場合に結果がNULLとなり（trueにならず）、検証をすり抜けていた。
--   その後 `v_current_status = new_status` もNULLとなって遷移検証も通過し、
--   最後のUPDATEが posts/comments の NOT NULL / CHECK 制約で失敗していた
--   （RPCの正式なerror contractではない）。
--
-- 修正: new_status IS NULL を明示的に INVALID_MODERATION_TRANSITION で拒否する。
--   それ以外の本体（is_admin()による認可、検証の順序、reasonの正規化と500文字上限、
--   FOR UPDATEでのlock、対象lookup、遷移規則、UPDATE、admin_logsのINSERT、
--   error code）は一切変更しない。NULL以外のinvalid値の挙動も従来と同じ。
--
-- CREATE OR REPLACE のため、signature / 戻り値 / owner / SECURITY DEFINER /
--   search_path / language / ACL は維持される（GRANT/REVOKEは行わない）。
-- 対象は moderate_post() と moderate_comment() のみ。既存migrationは編集しない。
-- 001〜023は変更しない。
-- =============================================================================

create or replace function public.moderate_post(
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

  if new_status is null or new_status not in ('published', 'hidden') then
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


create or replace function public.moderate_comment(
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

  if new_status is null or new_status not in ('published', 'hidden') then
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
