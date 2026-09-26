-- =============================================================================
-- 20260928000000_events_admin_update.sql
-- events の admin 内容更新 (M16): public.update_event()
--
-- 対象: public.update_event() の作成とEXECUTE ACLのみ。create_event() /
--   internal.normalize_event_content()（M15）、get_admin_events() / get_admin_event()
--   （M13・M14）、events のRLS policy・列単位のSELECT権限・table ACL・trigger、
--   他のfunction・table・default privilegeは変更しない。status変更のRPCは別途（M17）。
--
-- update_event(target_event_id, expected_updated_at, title, venue, event_date,
--              description, image_url, ticket_url) -> void
--   - 内容6項目（title / venue / event_date / description / image_url / ticket_url）の
--     全置換。description / image_url / ticket_url のNULLは「クリア」を意味するため、
--     引数は全て必須（省略できるDEFAULTは持たない）。status・id・created_by・created_at・
--     first_published_at は変更しない。updated_at は既存trigger（events_set_updated_at）が
--     更新し、RPCからは直接設定しない。
--   - 内容のnormalization / validation は M15 の internal.normalize_event_content() を
--     そのまま再利用する（規則を複製しない）。
--   - 戻り値は void。更新後の値は get_admin_event(target_event_id) で再取得する。
--
-- 楽観的同時実行制御（optimistic concurrency）:
--   expected_updated_at は必須。対象行を SELECT ... FOR UPDATE でlockし、同じlock下で
--   取得した現在の updated_at と expected_updated_at を「完全一致」で比較する
--   （date_trunc・ミリ秒への切り捨て・許容幅・大小比較は使わない。マイクロ秒まで一致が必要）。
--   不一致は EVENT_CONFLICT（UPDATEもadmin_logsもなし）。
--
-- 処理順:
--   1. public.is_admin()（active adminのみ）でなければ EVENT_MANAGEMENT_NOT_AUTHORIZED
--      （以降のどの検証よりも先）
--   2. expected_updated_at がNULLなら INVALID_EVENT_VERSION（version tokenがない入力）
--   3. 内容のnormalization / validation（違反は M15 と同じ INVALID_EVENT_* ）。
--      対象の存在確認より先に行う
--   4. 対象eventを FOR UPDATE でlock。NULLまたは不存在は EVENT_NOT_FOUND
--   5. 現在の updated_at と expected_updated_at の完全一致を確認。不一致は EVENT_CONFLICT
--      （内容がno-opでもversionが古ければ EVENT_CONFLICT。古い画面からの保存を黙って成功させない）
--   6. normalizedした内容が現在値と全項目同一（NULL-safe）ならno-op成功:
--      UPDATEしない・updated_atは変わらない・admin_logsも追加しない
--   7. 変更があればUPDATE（内容6項目のみ）し、admin_logs へ同一transactionで1行を記録
--
-- 全status（draft / public / 未公開cancelled / 公開済みcancelled）で内容の更新ができる
--   （statusによる制限は設けない）。公開の可視性（M11）はstatusとfirst_published_atで
--   決まるため、内容更新で変わらない。
--
-- admin_logs: action='update_event', target_type='event', target_id=対象のid,
--   detail={"changed_fields":[...]}。changed_fields は実際に変更された項目名だけを
--   固定順（title, venue, event_date, description, image_url, ticket_url）で並べる。
--   項目の値（新旧とも）は記録しない。
--
-- SECURITY DEFINER（owner=postgres）/ VOLATILE / search_path=''。全参照はschema修飾。
--   dynamic SQLは使用しない。
-- ACL: PUBLIC / anon / service_role からEXECUTEを取り消し、authenticatedに付与する。
-- 001〜031は変更しない。
-- =============================================================================

create function public.update_event(
  target_event_id uuid,
  expected_updated_at timestamptz,
  title text,
  venue text,
  event_date timestamptz,
  description text,
  image_url text,
  ticket_url text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin_id uuid := auth.uid();
  v_norm record;
  v_cur public.events%rowtype;
  v_changed text[] := array[]::text[];
begin
  if not public.is_admin() then
    raise exception 'EVENT_MANAGEMENT_NOT_AUTHORIZED';
  end if;

  if update_event.expected_updated_at is null then
    raise exception 'INVALID_EVENT_VERSION';
  end if;

  select *
    into v_norm
    from internal.normalize_event_content(
      update_event.title,
      update_event.venue,
      update_event.event_date,
      update_event.description,
      update_event.image_url,
      update_event.ticket_url
    );

  select e.*
    into v_cur
    from public.events as e
    where e.id = update_event.target_event_id
    for update;

  if not found then
    raise exception 'EVENT_NOT_FOUND';
  end if;

  if v_cur.updated_at is distinct from update_event.expected_updated_at then
    raise exception 'EVENT_CONFLICT';
  end if;

  if v_norm.title is distinct from v_cur.title then
    v_changed := array_append(v_changed, 'title');
  end if;
  if v_norm.venue is distinct from v_cur.venue then
    v_changed := array_append(v_changed, 'venue');
  end if;
  if v_norm.event_date is distinct from v_cur.event_date then
    v_changed := array_append(v_changed, 'event_date');
  end if;
  if v_norm.description is distinct from v_cur.description then
    v_changed := array_append(v_changed, 'description');
  end if;
  if v_norm.image_url is distinct from v_cur.image_url then
    v_changed := array_append(v_changed, 'image_url');
  end if;
  if v_norm.ticket_url is distinct from v_cur.ticket_url then
    v_changed := array_append(v_changed, 'ticket_url');
  end if;

  if cardinality(v_changed) = 0 then
    return;
  end if;

  update public.events
    set title = v_norm.title,
        venue = v_norm.venue,
        event_date = v_norm.event_date,
        description = v_norm.description,
        image_url = v_norm.image_url,
        ticket_url = v_norm.ticket_url
    where id = update_event.target_event_id;

  insert into public.admin_logs (admin_id, action, target_type, target_id, detail)
  values (
    v_admin_id,
    'update_event',
    'event',
    update_event.target_event_id,
    jsonb_build_object('changed_fields', to_jsonb(v_changed))
  );
end;
$$;

revoke execute on function public.update_event(uuid, timestamptz, text, text, timestamptz, text, text, text) from public;
revoke execute on function public.update_event(uuid, timestamptz, text, text, timestamptz, text, text, text) from anon;
revoke execute on function public.update_event(uuid, timestamptz, text, text, timestamptz, text, text, text) from service_role;
grant execute on function public.update_event(uuid, timestamptz, text, text, timestamptz, text, text, text) to authenticated;
