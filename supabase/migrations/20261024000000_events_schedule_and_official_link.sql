-- =============================================================================
-- 20261024000000_events_schedule_and_official_link.sql
-- LIVE機能 Phase 1: events に開場時刻・開演時刻・公式情報リンクを追加する
--
-- PM判断（2026-10-24付、LIVE機能Phase1の依頼）:
--   1. 開場時間・開演時間は、それぞれ独立したtimestamptz（日時）として保存する。
--      event_dateと同様、タイムゾーン付きで保存し、表示側（Next.js）で日本時間
--      として整形する（DB側はUTCで保存するtimestamptzのまま。6.5のevent_dateと
--      同じ方針を踏襲し、本migrationで新たな方針を作らない）。
--   2. 公式公演情報へのリンク（official_url）は、既存のticket_url（チケット関連の
--      外部リンク）とは別項目として追加する。
--
-- 対象（本migrationに含まれるもの）:
--   A. public.events に doors_time（開場時刻）・start_time（開演時刻）・
--      official_url（公式情報リンク）の3列を追加する
--   B. internal.normalize_event_content() を、上記3項目を含むシグネチャへ
--      置き換える（DROP FUNCTION + CREATE FUNCTION。既存の6項目の検証規則は
--      一切変更しない。新規3項目の検証のみ追加する）
--   C. public.create_event() を、上記3項目を受け取れるシグネチャへ置き換える
--      （DROP FUNCTION + CREATE FUNCTION）
--   D. public.update_event() を、上記3項目を受け取れるシグネチャへ置き換える
--      （DROP FUNCTION + CREATE FUNCTION）
--   E. public.get_admin_event() を、上記3項目を返すシグネチャへ置き換える
--      （DROP FUNCTION + CREATE FUNCTION。get_admin_events()の一覧7列は
--      変更しない — 一覧画面はdoors_time/start_time/official_urlを表示しない
--      ため、一覧RPCの返却列を広げる必要がない）
--   F. anon・authenticatedへ、新規3列（doors_time・start_time・official_url）の
--      列単位SELECT権限を追加で付与する（M12で確定した公開8列の既存GRANTは
--      変更しない。GRANTは追加のみで、REVOKE→再GRANTのやり直しはしない）
--
-- 対象に含まれないもの（変更しない）:
--   - events_select_public（M11のRLS policy。行の公開条件はstatus・
--     first_published_atのみに依存しており、本migrationの新規列はこの条件に
--     一切関与しない。「posts.event_idの参照可能範囲はevents_select_publicの
--     可視範囲と一致する」というM18の維持要件は、行の境界を変更しない本migration
--     では影響を受けない）
--   - get_admin_events()（M13。一覧の返却列は変更しない）
--   - set_event_status()（M17。status遷移・新規3列は無関係）
--   - events_guard_publish_state trigger（M1。first_published_atのlifecycleは
--     新規3列と無関係）
--   - event_participants・posts・reports・blocks・news・songs、他のfunction・
--     table・default privilege
--   - 既存のticket_url関連の検証規則（変更なし。official_urlは別項目として
--     同等の検証規則を新設するだけで、ticket_urlの規則を書き換えない）
--
-- -----------------------------------------------------------------------------
-- A. 列追加
--
-- doors_time（開場時刻）・start_time（開演時刻）: event_dateと同じ型
--   （timestamptz）。両方nullable（未定・未登録のLIVEを許容するため。6.5の
--   「未登録項目は空欄」というPM方針に合わせる）。event_date・doors_time・
--   start_time相互の前後関係を強制するCHECK制約は設けない（event_date自体が
--   「過去・未来とも許可し、年代の範囲制限はしない」という既存方針であり、
--   実運用では当日のタイムテーブル変更・会場都合等で前後関係が崩れるケースを
--   DB側で一律に拒否する必要はないと判断した。これは既存のevent_dateの検証
--   方針「過剰なvalidationをしない」との一貫性を優先した判断であり、PM指示に
--   明記された要件ではないため、別途確認が必要であれば報告する）。
--
-- official_url（公式情報リンク）: ticket_urlと同じtext型・nullable。
--   チケット購入リンクとは独立した項目として扱う（転売防止の観点からticket_url
--   は「公式リンクのみ想定」とされているが、official_urlは公演そのものの公式
--   告知ページ等、チケット販売を伴わない公式情報を指すことを想定する）。
-- -----------------------------------------------------------------------------
alter table public.events
  add column doors_time timestamptz,
  add column start_time timestamptz,
  add column official_url text;


-- -----------------------------------------------------------------------------
-- B. internal.normalize_event_content() の置き換え
--
-- 既存6項目（title / venue / event_date / description / image_url /
-- ticket_url）の検証ロジックは一切変更しない（既存のコメント・正規表現・
-- エラーコードをそのまま維持する）。新規3項目の検証のみ追加する。
--
-- doors_time・start_time: nullable。非NULLの場合は有限のtimestamptzのみ許可
--   する（event_dateと同じ基準）。infinity / -infinityは不正とする。
--   違反は INVALID_EVENT_DOORS_TIME / INVALID_EVENT_START_TIME。
--   doors_time・start_time・event_date相互の前後関係チェックはしない（上記A
--   の判断理由を参照）。
-- official_url: nullable。trim後に空ならNULL。最大2048文字。ticket_urlと
--   完全に同じ形式検証（https://のみ、host必須、userinfo禁止、空白・制御文字
--   禁止）を適用する（規則を複製するが、ticket_url自体のロジックは変更しない。
--   「公式サイトのみ」といった追加のドメイン検証は行わない — ticket_urlと
--   同水準の検証にとどめる）。違反は INVALID_EVENT_OFFICIAL_URL。
--
-- 複数項目が不正な場合の判定順序: 既存の
--   title -> venue -> event_date -> description -> ticket_url -> image_url
--   の後に、doors_time -> start_time -> official_url の順で追加検証する
--   （既存6項目の判定順序・エラーの優先順位は変更しない）。
-- -----------------------------------------------------------------------------
drop function internal.normalize_event_content(text, text, timestamptz, text, text, text);

create function internal.normalize_event_content(
  p_title text,
  p_venue text,
  p_event_date timestamptz,
  p_description text,
  p_image_url text,
  p_ticket_url text,
  p_doors_time timestamptz,
  p_start_time timestamptz,
  p_official_url text
)
returns table (
  title text,
  venue text,
  event_date timestamptz,
  description text,
  image_url text,
  ticket_url text,
  doors_time timestamptz,
  start_time timestamptz,
  official_url text
)
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_ws constant text := chr(32) || chr(9) || chr(10) || chr(13) || chr(12288);
  v_title text;
  v_venue text;
  v_description text;
  v_ticket text;
  v_image text;
  v_official text;
begin
  v_title := btrim(p_title, v_ws);
  if v_title is null or char_length(v_title) < 1 or char_length(v_title) > 100 then
    raise exception 'INVALID_EVENT_TITLE';
  end if;

  v_venue := btrim(p_venue, v_ws);
  if v_venue is null or char_length(v_venue) < 1 or char_length(v_venue) > 100 then
    raise exception 'INVALID_EVENT_VENUE';
  end if;

  if p_event_date is null or not isfinite(p_event_date) then
    raise exception 'INVALID_EVENT_DATE';
  end if;

  v_description := nullif(btrim(p_description, v_ws), '');
  if v_description is not null and char_length(v_description) > 5000 then
    raise exception 'INVALID_EVENT_DESCRIPTION';
  end if;

  v_ticket := nullif(btrim(p_ticket_url, v_ws), '');
  if v_ticket is not null then
    if char_length(v_ticket) > 2048
       or v_ticket !~ '^https://[^[:space:]/?#@:.][^[:space:]/?#@]*([/?#][^[:space:]]*)?$'
       or v_ticket ~ '[[:cntrl:]]'
       or position(chr(12288) in v_ticket) > 0 then
      raise exception 'INVALID_EVENT_TICKET_URL';
    end if;
  end if;

  v_image := nullif(btrim(p_image_url, v_ws), '');
  if v_image is not null then
    if v_image !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|jpeg|png|webp)$' then
      raise exception 'INVALID_EVENT_IMAGE_KEY';
    end if;
    v_image := lower(v_image);
  end if;

  if p_doors_time is not null and not isfinite(p_doors_time) then
    raise exception 'INVALID_EVENT_DOORS_TIME';
  end if;

  if p_start_time is not null and not isfinite(p_start_time) then
    raise exception 'INVALID_EVENT_START_TIME';
  end if;

  v_official := nullif(btrim(p_official_url, v_ws), '');
  if v_official is not null then
    if char_length(v_official) > 2048
       or v_official !~ '^https://[^[:space:]/?#@:.][^[:space:]/?#@]*([/?#][^[:space:]]*)?$'
       or v_official ~ '[[:cntrl:]]'
       or position(chr(12288) in v_official) > 0 then
      raise exception 'INVALID_EVENT_OFFICIAL_URL';
    end if;
  end if;

  return query select
    v_title, v_venue, p_event_date, v_description, v_image, v_ticket,
    p_doors_time, p_start_time, v_official;
end;
$$;

revoke execute on function internal.normalize_event_content(text, text, timestamptz, text, text, text, timestamptz, timestamptz, text) from public;
revoke execute on function internal.normalize_event_content(text, text, timestamptz, text, text, text, timestamptz, timestamptz, text) from anon;
revoke execute on function internal.normalize_event_content(text, text, timestamptz, text, text, text, timestamptz, timestamptz, text) from authenticated;
revoke execute on function internal.normalize_event_content(text, text, timestamptz, text, text, text, timestamptz, timestamptz, text) from service_role;


-- -----------------------------------------------------------------------------
-- C. public.create_event() の置き換え
--
-- 既存6項目の意味・サーバー管理項目（id/status/created_by/created_at/
-- updated_at/first_published_at）の扱いは一切変更しない。新規3項目
-- （doors_time・start_time・official_url）をDEFAULT NULLの末尾引数として
-- 追加する（既存の呼び出し規約を壊さない）。
-- -----------------------------------------------------------------------------
drop function public.create_event(text, text, timestamptz, text, text, text);

create function public.create_event(
  title text,
  venue text,
  event_date timestamptz,
  description text default null,
  image_url text default null,
  ticket_url text default null,
  doors_time timestamptz default null,
  start_time timestamptz default null,
  official_url text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin_id uuid := auth.uid();
  v_norm record;
  v_event_id uuid;
begin
  if not public.is_admin() then
    raise exception 'EVENT_MANAGEMENT_NOT_AUTHORIZED';
  end if;

  select *
    into v_norm
    from internal.normalize_event_content(
      create_event.title,
      create_event.venue,
      create_event.event_date,
      create_event.description,
      create_event.image_url,
      create_event.ticket_url,
      create_event.doors_time,
      create_event.start_time,
      create_event.official_url
    );

  insert into public.events (
    title, venue, event_date, description, image_url, ticket_url,
    doors_time, start_time, official_url, created_by
  )
  values (
    v_norm.title,
    v_norm.venue,
    v_norm.event_date,
    v_norm.description,
    v_norm.image_url,
    v_norm.ticket_url,
    v_norm.doors_time,
    v_norm.start_time,
    v_norm.official_url,
    v_admin_id
  )
  returning id into v_event_id;

  insert into public.admin_logs (admin_id, action, target_type, target_id, detail)
  values (
    v_admin_id,
    'create_event',
    'event',
    v_event_id,
    jsonb_build_object('to_status', 'draft')
  );

  return v_event_id;
end;
$$;

revoke execute on function public.create_event(text, text, timestamptz, text, text, text, timestamptz, timestamptz, text) from public;
revoke execute on function public.create_event(text, text, timestamptz, text, text, text, timestamptz, timestamptz, text) from anon;
revoke execute on function public.create_event(text, text, timestamptz, text, text, text, timestamptz, timestamptz, text) from service_role;
grant execute on function public.create_event(text, text, timestamptz, text, text, text, timestamptz, timestamptz, text) to authenticated;


-- -----------------------------------------------------------------------------
-- D. public.update_event() の置き換え
--
-- 既存の全置換・楽観的同時実行制御（expected_updated_at完全一致）・no-op判定・
-- admin_logsのchanged_fields記録方式は変更しない。新規3項目も既存6項目と同じ
-- 「全置換・NULLはクリアを意味する」方針に従う（DEFAULTを持たない必須引数と
-- する）。changed_fieldsの固定順序に、doors_time・start_time・official_urlを
-- 既存6項目の後ろに追加する。
-- -----------------------------------------------------------------------------
drop function public.update_event(uuid, timestamptz, text, text, timestamptz, text, text, text);

create function public.update_event(
  target_event_id uuid,
  expected_updated_at timestamptz,
  title text,
  venue text,
  event_date timestamptz,
  description text,
  image_url text,
  ticket_url text,
  doors_time timestamptz,
  start_time timestamptz,
  official_url text
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
      update_event.ticket_url,
      update_event.doors_time,
      update_event.start_time,
      update_event.official_url
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
  if v_norm.doors_time is distinct from v_cur.doors_time then
    v_changed := array_append(v_changed, 'doors_time');
  end if;
  if v_norm.start_time is distinct from v_cur.start_time then
    v_changed := array_append(v_changed, 'start_time');
  end if;
  if v_norm.official_url is distinct from v_cur.official_url then
    v_changed := array_append(v_changed, 'official_url');
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
        ticket_url = v_norm.ticket_url,
        doors_time = v_norm.doors_time,
        start_time = v_norm.start_time,
        official_url = v_norm.official_url
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

revoke execute on function public.update_event(uuid, timestamptz, text, text, timestamptz, text, text, text, timestamptz, timestamptz, text) from public;
revoke execute on function public.update_event(uuid, timestamptz, text, text, timestamptz, text, text, text, timestamptz, timestamptz, text) from anon;
revoke execute on function public.update_event(uuid, timestamptz, text, text, timestamptz, text, text, text, timestamptz, timestamptz, text) from service_role;
grant execute on function public.update_event(uuid, timestamptz, text, text, timestamptz, text, text, text, timestamptz, timestamptz, text) to authenticated;


-- -----------------------------------------------------------------------------
-- E. public.get_admin_event() の置き換え
--
-- /admin/events の詳細・編集画面が新規3列を表示・編集できるよう、返却列に
-- doors_time・start_time・official_urlを追加する（既存12列・認可・行の範囲は
-- 変更しない）。get_admin_events()（一覧RPC）は変更しない。
-- -----------------------------------------------------------------------------
drop function public.get_admin_event(uuid);

create function public.get_admin_event(
  target_event_id uuid
)
returns table (
  id uuid,
  title text,
  venue text,
  event_date timestamptz,
  description text,
  image_url text,
  ticket_url text,
  status text,
  created_by uuid,
  created_at timestamptz,
  updated_at timestamptz,
  first_published_at timestamptz,
  doors_time timestamptz,
  start_time timestamptz,
  official_url text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'EVENT_MANAGEMENT_NOT_AUTHORIZED';
  end if;

  return query
    select
      e.id,
      e.title,
      e.venue,
      e.event_date,
      e.description,
      e.image_url,
      e.ticket_url,
      e.status,
      e.created_by,
      e.created_at,
      e.updated_at,
      e.first_published_at,
      e.doors_time,
      e.start_time,
      e.official_url
    from public.events as e
    where e.id = get_admin_event.target_event_id;
end;
$$;

revoke execute on function public.get_admin_event(uuid) from public;
revoke execute on function public.get_admin_event(uuid) from anon;
revoke execute on function public.get_admin_event(uuid) from service_role;
grant execute on function public.get_admin_event(uuid) to authenticated;


-- -----------------------------------------------------------------------------
-- F. 公開列境界（M12）の拡張 — 新規3列のみ追加GRANT
--
-- 既存の公開8列のGRANTはそのまま維持する（REVOKE→再GRANTのやり直しはしない。
-- 冪等性よりも、既存の正しいGRANT文を一切触らないことを優先する）。
-- doors_time・start_time・official_urlの3列を、既存8列と同じ条件（anon・
-- authenticated双方）で追加GRANTする。行の公開条件（events_select_public）は
-- 変更しないため、公開されるeventの行はそのまま、見える列だけが3列増える。
-- -----------------------------------------------------------------------------
grant select (doors_time, start_time, official_url) on public.events to anon;
grant select (doors_time, start_time, official_url) on public.events to authenticated;
-- =============================================================================
