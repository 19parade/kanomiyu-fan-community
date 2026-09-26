-- =============================================================================
-- 20260927150000_process_report_rpc.sql
-- 通報処理RPC (M7): public.process_report(target_report_id, new_status, note)
--
-- 対象: public.process_report() の作成とEXECUTE ACLのみ。
--   reports のschema / M6のCHECK / RLS / policy / table ACL / trigger、
--   admin_logs、create_report() / get_my_reports() / moderate_*() 等の
--   既存objectは変更しない。
--
-- 役割: active adminが reports の status を処理する、唯一のwrite boundary。
--   reports へのクライアント直接UPDATEは M3 で閉じており、admin_logs への
--   書き込みもRPC内部に限られる。reports の更新と admin_logs のINSERTを
--   同一transactionでatomicに行う（片方だけが成立する状態を作らない）。
--
-- 認可・検証の順序:
--   1. public.is_admin()（active admin）でなければ REPORT_PROCESSING_NOT_AUTHORIZED
--      （以降のどの検証よりも先。report UUIDの存在等のoracleを作らない）
--   2. new_status が pending/reviewing/resolved/rejected の完全一致でなければ
--      INVALID_REPORT_STATUS（NULLを含む。trim/case補正なし）。
--      'pending' 自体はcanonicalなので、ここではなく遷移検証で拒否される。
--   3. note を正規化（両端の U+0020 / tab / LF / CR / U+3000 をtrimし、空ならNULL。
--      内部は保持）。正規化後1000文字超は REPORT_PROCESSING_NOTE_TOO_LONG。
--   4. 対象reportを SELECT ... FOR UPDATE でlock。NULL/不存在は
--      REPORT_NOT_AVAILABLE。lock取得後の最新statusに対して遷移を検証する。
--   5. 遷移が許可表になければ INVALID_REPORT_TRANSITION
--      （no-opを含む。UPDATEもadmin_logsもしない）。
--
-- 遷移表（成功は5通りのみ。resolved / rejected はterminalでreopenなし）:
--   pending   -> reviewing / resolved / rejected
--   reviewing -> resolved / rejected
--
-- handled系列の意味（M6のCHECKと整合）:
--   handled_by = 最終判断（resolved/rejected）を行った管理者、
--   handled_at = 最終判断が完了した日時。
--   reviewing への遷移では handled_by / handled_at はNULLのまま
--   （reviewingへ動かした管理者は admin_logs にのみ記録する）。
--   resolved / rejected では handled_by = auth.uid()、handled_at = now()。
--   updated_at は既存の reports_set_updated_at trigger に任せる。
--
-- admin_logs: 成功した遷移ごとにちょうど1行。
--   action='process_report', target_type='report', target_id=reports.id,
--   detail={from_status, to_status[, note]}（noteがNULLならkeyごと省略）。
--   reporter情報・reports.detail/reason・通報対象の本文等は複製しない。
--   noteは reports には保存せず、get_my_reports() にも返さない。
--
-- 対象のmoderation（moderate_post/moderate_comment）や profiles.status の変更は
-- 一切行わない（通報の処理とは別操作）。自分が作成した通報の処理も禁止しない。
-- 同時実行はrow lockで直列化する（expected_current_statusは持たない）。
--
-- 引数名は列名と衝突しないが、body内では関数名で修飾して曖昧さを避ける。
-- ACL: PUBLIC / anon からEXECUTEを取り消し、authenticatedに付与する。
--   service_role は publicスキーマのdefault privilegeにより自動付与される
--   （既存RPCと同じ既知の挙動）。auth.uid()がNULLのため関数内で拒否される。
-- 001〜022は変更しない。
-- =============================================================================

create function public.process_report(
  target_report_id uuid,
  new_status text,
  note text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin_id uuid := auth.uid();
  v_current_status text;
  v_note text;
begin
  if not public.is_admin() then
    raise exception 'REPORT_PROCESSING_NOT_AUTHORIZED';
  end if;

  if process_report.new_status is null
     or process_report.new_status not in ('pending', 'reviewing', 'resolved', 'rejected') then
    raise exception 'INVALID_REPORT_STATUS';
  end if;

  v_note := nullif(
    btrim(process_report.note, chr(32) || chr(9) || chr(10) || chr(13) || chr(12288)),
    ''
  );
  if v_note is not null and char_length(v_note) > 1000 then
    raise exception 'REPORT_PROCESSING_NOTE_TOO_LONG';
  end if;

  select r.status
    into v_current_status
    from public.reports r
    where r.id = process_report.target_report_id
    for update;

  if not found then
    raise exception 'REPORT_NOT_AVAILABLE';
  end if;

  if not (
    (v_current_status = 'pending'
      and process_report.new_status in ('reviewing', 'resolved', 'rejected'))
    or
    (v_current_status = 'reviewing'
      and process_report.new_status in ('resolved', 'rejected'))
  ) then
    raise exception 'INVALID_REPORT_TRANSITION';
  end if;

  if process_report.new_status = 'reviewing' then
    update public.reports
      set status = process_report.new_status
      where id = process_report.target_report_id;
  else
    update public.reports
      set status = process_report.new_status,
          handled_by = v_admin_id,
          handled_at = now()
      where id = process_report.target_report_id;
  end if;

  insert into public.admin_logs (admin_id, action, target_type, target_id, detail)
  values (
    v_admin_id,
    'process_report',
    'report',
    process_report.target_report_id,
    case when v_note is null
      then jsonb_build_object('from_status', v_current_status, 'to_status', process_report.new_status)
      else jsonb_build_object('from_status', v_current_status, 'to_status', process_report.new_status, 'note', v_note)
    end
  );
end;
$$;

revoke execute on function public.process_report(uuid, text, text) from public;
revoke execute on function public.process_report(uuid, text, text) from anon;
grant execute on function public.process_report(uuid, text, text) to authenticated;
