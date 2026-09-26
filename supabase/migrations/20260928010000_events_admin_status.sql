-- =============================================================================
-- 20260928010000_events_admin_status.sql
-- events の admin status 変更 (M17): public.set_event_status()
--
-- 対象: public.set_event_status() の作成とEXECUTE ACLのみ。create_event() /
--   internal.normalize_event_content()（M15）、update_event()（M16）、
--   get_admin_events() / get_admin_event()（M13・M14）、events のRLS policy・列単位の
--   SELECT権限・table ACL・trigger、admin_logs のRLS/ACL、他のfunction・table・
--   default privilegeは変更しない。events admin write boundary の最後のRPC。
--
-- set_event_status(target_event_id, new_status, expected_updated_at) -> void
--   - 引数は全て必須（DEFAULTなし）。戻り値は void。成功後は get_admin_event() で再取得する。
--   - new_status は 'draft' / 'public' / 'cancelled' の完全一致のみ（trim・大文字小文字の
--     補正なし）。NULLを含むそれ以外は INVALID_EVENT_STATUS。
--   - status以外（title / venue / event_date / description / image_url / ticket_url /
--     created_by / created_at）は変更しない。first_published_at は既存trigger
--     （events_guard_publish_state）が管理し、RPCからは設定しない。updated_at も
--     既存trigger（events_set_updated_at）が更新する。
--
-- 処理順:
--   1. public.is_admin()（active adminのみ）でなければ EVENT_MANAGEMENT_NOT_AUTHORIZED
--      （以降のどの検証よりも先）
--   2. new_status の検証（INVALID_EVENT_STATUS）
--   3. expected_updated_at がNULLなら INVALID_EVENT_VERSION
--   4. 対象eventを SELECT ... FOR UPDATE でlock（存在確認とversion取得を同一lock下で行う）。
--      NULLまたは不存在は EVENT_NOT_FOUND
--   5. 現在の updated_at と expected_updated_at の完全一致を確認。不一致は EVENT_CONFLICT
--      （date_trunc・切り捨て・許容幅・大小比較は使わない。遷移の検証より先）
--   6. 遷移の検証。許可されない遷移（同じstatusへの遷移を含む）は INVALID_EVENT_TRANSITION
--   7. statusをUPDATEし、admin_logs へ同一transactionで1行を記録
--
-- 許可する遷移（それ以外は INVALID_EVENT_TRANSITION）:
--   draft                             -> public     （公開。公開への通常の入口）
--   draft                             -> cancelled  （破棄したdraftの退避。公開されない）
--   public                            -> cancelled  （中止。公開は継続する）
--   cancelled（first_published_at NULL） -> draft   （退避したdraftの復元）
--   cancelled（first_published_at 非NULL）-> public  （中止の撤回・開催の復活）
--   公開されたことのないcancelledから直接publicにはできない（draftへ戻してから公開する）。
--   公開済みのeventはdraftに戻せない。同じstatusへの遷移（no-op）は拒否し、UPDATEも
--   updated_atの変更もadmin_logsの追加もしない。
--   RPCが遷移を事前に検証するため、既存triggerの例外（EVENTS_CANNOT_REVERT_TO_DRAFT等）は
--   正常なRPCの契約としては呼び出し側に現れない。triggerは最後の防衛線として残る。
--
-- 公開の可視性（M11）はstatusとfirst_published_atで決まる: draft->public で公開され、
--   public->cancelled と 公開済みcancelled->public では公開が継続し、draft->cancelled と
--   未公開cancelled->draft は非公開のまま。first_published_at は初回のdraft->public でのみ
--   設定され、その後の中止・再公開では上書きされない（triggerの契約）。
--
-- admin_logs: action='set_event_status', target_type='event', target_id=対象のid,
--   detail={"from_status":"...","to_status":"..."}。それ以外の値は記録しない。
--
-- SECURITY DEFINER（owner=postgres）/ VOLATILE / search_path=''。全参照はschema修飾。
--   dynamic SQLは使用しない。
-- ACL: PUBLIC / anon / service_role からEXECUTEを取り消し、authenticatedに付与する。
-- 001〜032は変更しない。
-- =============================================================================

create function public.set_event_status(
  target_event_id uuid,
  new_status text,
  expected_updated_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin_id uuid := auth.uid();
  v_cur public.events%rowtype;
  v_allowed boolean;
begin
  if not public.is_admin() then
    raise exception 'EVENT_MANAGEMENT_NOT_AUTHORIZED';
  end if;

  if set_event_status.new_status is null
     or set_event_status.new_status not in ('draft', 'public', 'cancelled') then
    raise exception 'INVALID_EVENT_STATUS';
  end if;

  if set_event_status.expected_updated_at is null then
    raise exception 'INVALID_EVENT_VERSION';
  end if;

  select e.*
    into v_cur
    from public.events as e
    where e.id = set_event_status.target_event_id
    for update;

  if not found then
    raise exception 'EVENT_NOT_FOUND';
  end if;

  if v_cur.updated_at is distinct from set_event_status.expected_updated_at then
    raise exception 'EVENT_CONFLICT';
  end if;

  v_allowed :=
    (v_cur.status = 'draft' and set_event_status.new_status in ('public', 'cancelled'))
    or (v_cur.status = 'public' and set_event_status.new_status = 'cancelled')
    or (v_cur.status = 'cancelled' and v_cur.first_published_at is null and set_event_status.new_status = 'draft')
    or (v_cur.status = 'cancelled' and v_cur.first_published_at is not null and set_event_status.new_status = 'public');

  if not v_allowed then
    raise exception 'INVALID_EVENT_TRANSITION';
  end if;

  update public.events
    set status = set_event_status.new_status
    where id = set_event_status.target_event_id;

  insert into public.admin_logs (admin_id, action, target_type, target_id, detail)
  values (
    v_admin_id,
    'set_event_status',
    'event',
    set_event_status.target_event_id,
    jsonb_build_object('from_status', v_cur.status, 'to_status', set_event_status.new_status)
  );
end;
$$;

revoke execute on function public.set_event_status(uuid, text, timestamptz) from public;
revoke execute on function public.set_event_status(uuid, text, timestamptz) from anon;
revoke execute on function public.set_event_status(uuid, text, timestamptz) from service_role;
grant execute on function public.set_event_status(uuid, text, timestamptz) to authenticated;
