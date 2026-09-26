-- =============================================================================
-- 20260927230000_events_admin_create.sql
-- events の admin 作成 (M15): public.create_event() と、入力のnormalization /
--   validation を担う内部helper internal.normalize_event_content()
--
-- 対象: 上記2つのfunction と ACL のみ。events のRLS policy・列単位のSELECT権限・
--   table ACL・trigger、get_admin_events() / get_admin_event()（M13・M14）、
--   他のfunction・table・default privilegeは変更しない。update / status変更の
--   RPCは本migrationでは作成しない（M16以降）。
--
-- create_event(title, venue, event_date, description, image_url, ticket_url) -> uuid
--   - 認可: 関数の最初に public.is_admin()（active adminのみ）を評価し、falseなら
--     EVENT_MANAGEMENT_NOT_AUTHORIZED。validationよりも先に行う。
--   - clientから受け取らない項目（サーバー側で管理）:
--       id                 -> DB default (gen_random_uuid())
--       status             -> DB default ('draft')。RPCは指定しない
--       created_by         -> auth.uid()
--       created_at / updated_at -> DB default
--       first_published_at -> 既存trigger（events_guard_publish_state。draft作成時はNULL）
--   - 戻り値は作成したeventのUUIDのみ。作成後の詳細は get_admin_event(id) で取得する。
--   - admin_logs へ、event のINSERTと同一transactionで1行を記録する
--     （action='create_event', target_type='event', target_id=作成したid,
--      detail={"to_status":"draft"}）。title / description / URL等は記録しない。
--     どちらかが失敗すれば全体がrollbackされる。
--
-- 入力のnormalization / validation（internal.normalize_event_content。同じ規則を
--   将来のupdate_eventでも共有するためhelperに切り出す。status遷移や同時実行の
--   制御は含めない）:
--   前後のtrim対象は U+0020 / tab / LF / CR / U+3000。長さはcharacter数。
--   - title      : trim、1〜100文字。違反は INVALID_EVENT_TITLE（NULL・空白のみを含む）。
--   - venue      : trim、1〜100文字。違反は INVALID_EVENT_VENUE。形式は制限しない。
--   - event_date : NOT NULL。過去・未来とも許可し、年代の範囲制限はしない。
--                  NULLおよび非有限値（infinity / -infinity）は INVALID_EVENT_DATE
--                  （非有限値は日時ではないため）。
--   - description: NULL可。trim後に空ならNULL。最大5000文字。違反は INVALID_EVENT_DESCRIPTION。
--   - ticket_url : NULL可。trim後に空ならNULL。最大2048文字。`https://` のみ許可
--                  （scheme は小文字の https）、hostが必須（先頭が `:` `.` でなく、
--                  `/` `?` `#` `@` を含まない）、userinfo（`user@` / `user:pass@`）禁止、
--                  空白・制御文字（U+3000を含む）禁止。過剰なRFC準拠の検査は行わず、
--                  IPv6 / IDN等の独自実装もしない。違反は INVALID_EVENT_TICKET_URL。
--   - image_url  : NULL可。trim後に空ならNULL。Storage `event-images` バケット内のobject key
--                  `{uuid}.{ext}`（extは jpg / jpeg / png / webp）のみ。UUIDと拡張子は
--                  大文字小文字を区別せず受理し、保存時はlowercaseへnormalizeする。
--                  完全URL・bucket名を含むpath・`../`・query・追加のpath等は拒否。
--                  object の実在は確認しない。違反は INVALID_EVENT_IMAGE_KEY。
--   複数の項目が不正な場合は title -> venue -> event_date -> description ->
--   ticket_url -> image_url の順で最初の違反を返す。
--
-- SECURITY DEFINER（owner=postgres）/ VOLATILE / search_path=''。全参照はschema修飾。
--   dynamic SQLは使用しない。
-- ACL:
--   create_event: PUBLIC / anon / service_role からEXECUTEを取り消し、authenticatedに付与する。
--   internal.normalize_event_content: PUBLIC / anon / authenticated / service_role から
--     EXECUTEを取り消す（postgresのみ。create_event（owner=postgres）の内部からのみ呼ばれる）。
-- 001〜030は変更しない。
-- =============================================================================

create function internal.normalize_event_content(
  p_title text,
  p_venue text,
  p_event_date timestamptz,
  p_description text,
  p_image_url text,
  p_ticket_url text
)
returns table (
  title text,
  venue text,
  event_date timestamptz,
  description text,
  image_url text,
  ticket_url text
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

  return query select v_title, v_venue, p_event_date, v_description, v_image, v_ticket;
end;
$$;

revoke execute on function internal.normalize_event_content(text, text, timestamptz, text, text, text) from public;
revoke execute on function internal.normalize_event_content(text, text, timestamptz, text, text, text) from anon;
revoke execute on function internal.normalize_event_content(text, text, timestamptz, text, text, text) from authenticated;
revoke execute on function internal.normalize_event_content(text, text, timestamptz, text, text, text) from service_role;


create function public.create_event(
  title text,
  venue text,
  event_date timestamptz,
  description text default null,
  image_url text default null,
  ticket_url text default null
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
      create_event.ticket_url
    );

  insert into public.events (title, venue, event_date, description, image_url, ticket_url, created_by)
  values (
    v_norm.title,
    v_norm.venue,
    v_norm.event_date,
    v_norm.description,
    v_norm.image_url,
    v_norm.ticket_url,
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

revoke execute on function public.create_event(text, text, timestamptz, text, text, text) from public;
revoke execute on function public.create_event(text, text, timestamptz, text, text, text) from anon;
revoke execute on function public.create_event(text, text, timestamptz, text, text, text) from service_role;
grant execute on function public.create_event(text, text, timestamptz, text, text, text) to authenticated;
