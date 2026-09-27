-- =============================================================================
-- 20260928040000_event_participants_write.sql
-- event_participants の本人write (M20): public.set_my_event_participation()
--
-- 対象: public.set_my_event_participation() の作成とEXECUTE ACLのみ。event_participants
--   のtable・列・default・CHECK・UNIQUE・FK・index・trigger・RLS policy・ACL（M19）、
--   events・posts・admin_logs、他のfunction・default privilegeは変更しない。
--   authenticatedへbase tableのINSERT / UPDATE / DELETE権限は付与しない
--   （書き込みはこのSECURITY DEFINER RPC経由のみ）。helper・trigger・列は追加しない。
--
-- set_my_event_participation(target_event_id, new_status, new_visibility)
--   -> TABLE (status text, visibility text)
--   - 引数は全て必須（DEFAULTなし）。NULLは「変更しない」を意味せず、常にdesired-state
--     （望ましい状態）を完全指定する。対象は常に自分自身（user_id = auth.uid()）で、
--     他人を指定する引数はない（adminも他人の行は変更できない）。
--   - 戻り値は成功後の status / visibility の2列のみ（insert・update・no-opで同じshape）。
--   - new_status は 'going' / 'attended' / 'cancelled'、new_visibility は
--     'public' / 'private' / 'attended' の完全一致のみ（trim・大文字小文字の補正なし）。
--
-- 処理順:
--   1. public.is_active_user()（active本人のみ）でなければ
--      EVENT_PARTICIPATION_NOT_AUTHORIZED（以降のどの検証よりも先）
--   2. new_status の検証（INVALID_PARTICIPATION_STATUS）
--   3. new_visibility の検証（INVALID_PARTICIPATION_VISIBILITY）
--   4. 対象eventを SELECT ... FOR SHARE でlock（M17のFOR UPDATEと直列化される。lock順序は
--      常に events -> event_participants）
--   5. 自分のparticipant行を SELECT ... FOR UPDATE でlock（なければ新規作成へ）
--   6. 新規作成: event.status が 'public' でなければ（不存在・NULL・draft・cancelledを
--      公開履歴に関係なく区別せず）EVENT_NOT_AVAILABLE_FOR_PARTICIPATION。new_status が
--      'cancelled' なら INVALID_PARTICIPATION_TRANSITION。'attended' は event_date <= now()
--      でなければ EVENT_NOT_AVAILABLE_FOR_ATTENDANCE。'going' は event_date に依存しない。
--      INSERT ... ON CONFLICT (event_id, user_id) DO NOTHING で同時の初回作成に備え、
--      衝突した場合（他transactionが先にcommit）は既存行として扱う（UNIQUE違反は露出しない）。
--   7. 既存行: desired stateが現在と完全一致ならno-op（成功。UPDATEしない）。statusを
--      going / attended へ「新しく肯定する」変更（現在のstatusと異なるnew_statusが
--      going / attended）は、event.status が 'public' でなければ
--      EVENT_NOT_AVAILABLE_FOR_PARTICIPATION、'attended' は event_date <= now() でなければ
--      EVENT_NOT_AVAILABLE_FOR_ATTENDANCE。'cancelled' への変更とvisibilityのみの変更は
--      eventの状態（draft・cancelledを含む）に関係なく許可する（本人のprivacy control）。
--      public eventでは、既存行の全status遷移（同一statusを含む）を許可する。
--   8. 行を更新して現在のstatus / visibilityを返す
--
-- 同時実行: optimistic concurrency（updated_at等）は使わず、DBのlockで直列化する
--   （last committed desired-state wins）。event行のFOR SHAREにより、eventを cancelled にする
--   set_event_status（FOR UPDATE）とは直列化され、cancelledが確定した後に新規の going /
--   attended が滑り込むことはない。
-- admin_logs には記録しない（本人の通常操作）。blocks・profile属性・event_participants以外の
--   参加登録・first_published_at は参照しない。posts（M18）の条件には影響しない。
--
-- SECURITY DEFINER（owner=postgres）/ VOLATILE / search_path=''。全参照はschema修飾。
--   dynamic SQLは使用しない。
-- ACL: PUBLIC / anon / service_role からEXECUTEを取り消し、authenticatedに付与する。
-- 001〜035は変更しない。
-- =============================================================================

create function public.set_my_event_participation(
  target_event_id uuid,
  new_status text,
  new_visibility text
)
returns table (status text, visibility text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_event_status text;
  v_event_date timestamptz;
  v_cur public.event_participants%rowtype;
  v_inserted int;
begin
  if not public.is_active_user() then
    raise exception 'EVENT_PARTICIPATION_NOT_AUTHORIZED';
  end if;

  if set_my_event_participation.new_status is null
     or set_my_event_participation.new_status not in ('going', 'attended', 'cancelled') then
    raise exception 'INVALID_PARTICIPATION_STATUS';
  end if;

  if set_my_event_participation.new_visibility is null
     or set_my_event_participation.new_visibility not in ('public', 'private', 'attended') then
    raise exception 'INVALID_PARTICIPATION_VISIBILITY';
  end if;

  select e.status, e.event_date
    into v_event_status, v_event_date
    from public.events as e
    where e.id = set_my_event_participation.target_event_id
    for share;

  if not found then
    raise exception 'EVENT_NOT_AVAILABLE_FOR_PARTICIPATION';
  end if;

  select ep.*
    into v_cur
    from public.event_participants as ep
    where ep.event_id = set_my_event_participation.target_event_id
      and ep.user_id = v_uid
    for update;

  if not found then
    if v_event_status <> 'public' then
      raise exception 'EVENT_NOT_AVAILABLE_FOR_PARTICIPATION';
    end if;

    if set_my_event_participation.new_status = 'cancelled' then
      raise exception 'INVALID_PARTICIPATION_TRANSITION';
    end if;

    if set_my_event_participation.new_status = 'attended' and v_event_date > now() then
      raise exception 'EVENT_NOT_AVAILABLE_FOR_ATTENDANCE';
    end if;

    insert into public.event_participants (event_id, user_id, status, visibility)
    values (
      set_my_event_participation.target_event_id,
      v_uid,
      set_my_event_participation.new_status,
      set_my_event_participation.new_visibility
    )
    on conflict (event_id, user_id) do nothing;

    get diagnostics v_inserted = row_count;

    if v_inserted = 1 then
      return query select set_my_event_participation.new_status, set_my_event_participation.new_visibility;
      return;
    end if;

    -- 同時の初回作成で他transactionが先にcommitした場合: 既存行として扱う。
    select ep.*
      into v_cur
      from public.event_participants as ep
      where ep.event_id = set_my_event_participation.target_event_id
        and ep.user_id = v_uid
      for update;
  end if;

  if v_cur.status = set_my_event_participation.new_status
     and v_cur.visibility = set_my_event_participation.new_visibility then
    return query select v_cur.status, v_cur.visibility;
    return;
  end if;

  if set_my_event_participation.new_status in ('going', 'attended')
     and set_my_event_participation.new_status <> v_cur.status then
    if v_event_status <> 'public' then
      raise exception 'EVENT_NOT_AVAILABLE_FOR_PARTICIPATION';
    end if;

    if set_my_event_participation.new_status = 'attended' and v_event_date > now() then
      raise exception 'EVENT_NOT_AVAILABLE_FOR_ATTENDANCE';
    end if;
  end if;

  update public.event_participants as ep
    set status = set_my_event_participation.new_status,
        visibility = set_my_event_participation.new_visibility
    where ep.id = v_cur.id;

  return query select set_my_event_participation.new_status, set_my_event_participation.new_visibility;
end;
$$;

revoke execute on function public.set_my_event_participation(uuid, text, text) from public;
revoke execute on function public.set_my_event_participation(uuid, text, text) from anon;
revoke execute on function public.set_my_event_participation(uuid, text, text) from service_role;
grant execute on function public.set_my_event_participation(uuid, text, text) to authenticated;
