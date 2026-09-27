-- =============================================================================
-- 20260928050000_event_participants_discovery.sql
-- event_participants のfan-facing読み取り (M21): public.get_event_participants()
--
-- 対象: public.get_event_participants() の作成とEXECUTE ACLのみ。event_participants の
--   table・列・default・CHECK・UNIQUE・FK・index・trigger・RLS policy・ACL（M19）、
--   set_my_event_participation()（M20）、events・profiles・blocks・posts・その他のtable・
--   function・default privilegeは変更しない。新しいhelper・RLS policy・index・列は追加しない。
--
-- get_event_participants(target_event_id, status_filter, after_username, after_id, page_size)
--   -> TABLE (id, username, display_name, avatar_url, fan_since, participation_status)
--   「このLIVEに参加予定・参加済みとして、他のファンに公開してよいユーザー」の一覧を返す
--   （ticket・check-inの一覧ではなく、本人の申告）。anonには公開しない（EXECUTEなし）。
--   - id は profiles.id（参加者のuser id）。event_participants.id ではない。
--   - 返さない列: event_participants.id / event_id / visibility / created_at、profiles.bio・
--     role・status・その他、event項目、件数（total_count等）。
--   - SECURITY DEFINER（RLSをbypassする）のため、RLSに依存せず、次の条件を関数内で明示する。
--
-- 条件（すべてAND）:
--   1. 閲覧者: internal.is_community_browsing_allowed()（active / suspended）。banned・
--      profileなし・uid NULLは、エラーにせず0行（status_filter等の検証より前に判定する）。
--   2. event: events.status = 'public' のみ（cancelledは、公開履歴に関係なく0行。M11の
--      公開範囲より狭い。不存在・NULL・draftも0行でエラーにしない）。event_dateは条件にしない。
--   3. 参加者の公開条件: (visibility = 'public' AND status IN ('going','attended')) OR
--      (visibility = 'attended' AND status = 'attended')。private・status='cancelled'は常に除外。
--   4. 参加者のprofiles.status IN ('active','suspended')（bannedは非表示）。
--   5. 双方向block: NOT internal.is_blocked_with(参加者のid)（閲覧者自身には常にfalse）。
--   6. status_filter: NULL（going + attended）/ 'going' / 'attended'（完全一致。それ以外は
--      INVALID_PARTICIPANT_STATUS_FILTER）。公開条件を上書きせず、絞り込みのみ行う。
--   adminも通常のfan-facingな閲覧者と同じ条件（bypassなし）。本人・adminの全行の読み取りは
--   M19のbase tableのSELECT policyを使う。
--
-- pagination: username ASC, id ASC のkeyset。after_username / after_id は両方NULL（先頭
--   ページ）か両方指定（cursor）のみ有効で、片方だけならINVALID_PARTICIPANT_CURSOR。
--   cursor対象の存在・可視性は確認しない（値そのものを境界として比較する）。page_size は
--   NULLなら20、それ以外は1〜100へclampする（get_public_profiles()と同じ）。
-- 検索・件数・event participantの詳細取得は提供しない。row lock（FOR UPDATE / FOR SHARE）は
--   取らない（STABLE。1 statement内で一貫したsnapshotを読む）。
--
-- SECURITY DEFINER（owner=postgres）/ STABLE / search_path=''。全参照はschema修飾。
--   dynamic SQLは使用しない。
-- ACL: PUBLIC / anon / service_role からEXECUTEを取り消し、authenticatedに付与する。
-- 001〜036は変更しない。
-- =============================================================================

create function public.get_event_participants(
  target_event_id uuid,
  status_filter text default null,
  after_username text default null,
  after_id uuid default null,
  page_size integer default 20
)
returns table (
  id uuid,
  username text,
  display_name text,
  avatar_url text,
  fan_since date,
  participation_status text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_page_size int;
begin
  if not internal.is_community_browsing_allowed() then
    return;
  end if;

  if get_event_participants.status_filter is not null
     and get_event_participants.status_filter not in ('going', 'attended') then
    raise exception 'INVALID_PARTICIPANT_STATUS_FILTER';
  end if;

  if (get_event_participants.after_username is null) <> (get_event_participants.after_id is null) then
    raise exception 'INVALID_PARTICIPANT_CURSOR';
  end if;

  if get_event_participants.page_size is null then
    v_page_size := 20;
  else
    v_page_size := least(greatest(get_event_participants.page_size, 1), 100);
  end if;

  return query
    select
      p.id,
      p.username,
      p.display_name,
      p.avatar_url,
      p.fan_since,
      ep.status
    from public.event_participants as ep
    join public.profiles as p on p.id = ep.user_id
    where ep.event_id = get_event_participants.target_event_id
      and exists (
        select 1
        from public.events as e
        where e.id = ep.event_id
          and e.status = 'public'
      )
      and (
        (ep.visibility = 'public' and ep.status in ('going', 'attended'))
        or (ep.visibility = 'attended' and ep.status = 'attended')
      )
      and (
        get_event_participants.status_filter is null
        or ep.status = get_event_participants.status_filter
      )
      and p.status in ('active', 'suspended')
      and not internal.is_blocked_with(p.id)
      and (
        get_event_participants.after_username is null
        or (p.username, p.id) > (get_event_participants.after_username, get_event_participants.after_id)
      )
    order by p.username asc, p.id asc
    limit v_page_size;
end;
$$;

revoke execute on function public.get_event_participants(uuid, text, text, uuid, integer) from public;
revoke execute on function public.get_event_participants(uuid, text, text, uuid, integer) from anon;
revoke execute on function public.get_event_participants(uuid, text, text, uuid, integer) from service_role;
grant execute on function public.get_event_participants(uuid, text, text, uuid, integer) to authenticated;
