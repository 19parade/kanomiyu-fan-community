-- =============================================================================
-- 20260927210000_events_admin_list.sql
-- events の admin 一覧 read boundary (M13): public.get_admin_events()
--
-- 対象: public.get_admin_events() の作成とEXECUTE ACLのみ。
--   events のRLS policy（events_select_public）・列単位のSELECT権限・trigger、
--   他のfunction・table・default privilegeは変更しない。
--
-- 背景: M12でanon / authenticatedがbase tableから読める列を公開8列に絞ったため、
--   /admin/events用にadminが全status・内部列を読む経路は、adminも同じ authenticated
--   ロールである以上base tableの権限では実現できない。専用のSECURITY DEFINER RPCを
--   trustedな読み取り境界とする。本migrationは一覧のみ（detail RPCは別途）。
--
-- 認可: 関数の最初に public.is_admin()（active adminのみ）を評価し、falseなら
--   EVENT_MANAGEMENT_NOT_AUTHORIZED（明示エラー）。引数の検証よりも先に行う。
--   一般ユーザー・suspended/bannedのadmin・profile不在・auth.uid()がNULLはいずれも拒否。
--
-- 返却列（exactly 7列）: id / title / venue / event_date / status /
--   first_published_at / updated_at。description / image_url / ticket_url /
--   created_by / created_at は一覧では返さない（データ最小化）。
--
-- 行の範囲: 全event（draft / public / 一度も公開されていないcancelled /
--   公開済みcancelled）。管理用のtrustedな境界であり、公開のRLS条件（M11）は複製しない。
--   adminのbase table SELECTは引き続き公開行の公開8列のみである（両者は別の境界）。
--
-- 並び順: event_date DESC, id DESC（決定的）。keyset pagination:
--   (event_date, id) < (after_event_date, after_id)。after_event_date と after_id は
--   両方NULL（先頭ページ）か両方非NULL（次ページ）のみ有効で、片方のみは
--   INVALID_EVENT_CURSOR。cursorが実在する行である必要はない。
-- page_size: NULLなら20、1未満は1、100超は100（エラーにしない）。
-- search: title / venue の部分一致（大文字小文字を区別しない）。前後の空白類
--   （U+0020 / tab / LF / CR / U+3000）をtrimし、空ならfilterなし。trim後100文字を
--   超えるとEVENT_SEARCH_TOO_LONG。LIKEのワイルドカード（%・_）とescape文字（\）は
--   通常の文字として扱う。
-- status_filter: NULLなら全status。draft / public / cancelled の完全一致のみ許可し、
--   それ以外（空文字を含む）は INVALID_EVENT_STATUS_FILTER。
-- 含めないもの: 過去/未来のfilter、総件数、detail、write、admin_logsへの記録
--   （readは記録しない）。
--
-- SECURITY DEFINER（owner=postgres）/ STABLE / search_path=''。全参照はschema修飾。
--   dynamic SQLは使用しない。
-- ACL: PUBLIC / anon / service_role からEXECUTEを取り消し、authenticatedに付与する
--   （default privilegeに依存しない）。service_roleは呼び出す必要がない。
-- 001〜028は変更しない。
-- =============================================================================

create function public.get_admin_events(
  search text default null,
  status_filter text default null,
  after_event_date timestamptz default null,
  after_id uuid default null,
  page_size integer default 20
)
returns table (
  id uuid,
  title text,
  venue text,
  event_date timestamptz,
  status text,
  first_published_at timestamptz,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_search text;
  v_pattern text;
  v_page_size integer;
begin
  if not public.is_admin() then
    raise exception 'EVENT_MANAGEMENT_NOT_AUTHORIZED';
  end if;

  if (get_admin_events.after_event_date is null) <> (get_admin_events.after_id is null) then
    raise exception 'INVALID_EVENT_CURSOR';
  end if;

  v_search := nullif(
    btrim(get_admin_events.search, chr(32) || chr(9) || chr(10) || chr(13) || chr(12288)),
    ''
  );
  if v_search is not null and char_length(v_search) > 100 then
    raise exception 'EVENT_SEARCH_TOO_LONG';
  end if;

  if get_admin_events.status_filter is not null
     and get_admin_events.status_filter not in ('draft', 'public', 'cancelled') then
    raise exception 'INVALID_EVENT_STATUS_FILTER';
  end if;

  v_page_size := least(greatest(coalesce(get_admin_events.page_size, 20), 1), 100);

  -- LIKEのwildcard（% _）とescape文字（\）を通常の文字として扱う。
  if v_search is not null then
    v_pattern := '%' || replace(replace(replace(v_search, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;

  return query
    select
      e.id,
      e.title,
      e.venue,
      e.event_date,
      e.status,
      e.first_published_at,
      e.updated_at
    from public.events as e
    where (get_admin_events.status_filter is null or e.status = get_admin_events.status_filter)
      and (
        v_search is null
        or e.title ilike v_pattern escape '\'
        or e.venue ilike v_pattern escape '\'
      )
      and (
        get_admin_events.after_event_date is null
        or (e.event_date, e.id) < (get_admin_events.after_event_date, get_admin_events.after_id)
      )
    order by e.event_date desc, e.id desc
    limit v_page_size;
end;
$$;

revoke execute on function public.get_admin_events(text, text, timestamptz, uuid, integer) from public;
revoke execute on function public.get_admin_events(text, text, timestamptz, uuid, integer) from anon;
revoke execute on function public.get_admin_events(text, text, timestamptz, uuid, integer) from service_role;
grant execute on function public.get_admin_events(text, text, timestamptz, uuid, integer) to authenticated;
