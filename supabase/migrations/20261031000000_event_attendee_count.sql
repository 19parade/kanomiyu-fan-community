-- =============================================================================
-- 20261031000000_event_attendee_count.sql
-- /live/[id] の「参加者：○名」表示用（開催終了LIVE限定）:
--   public.get_event_attendee_count()
--
-- PM確定方針（2026-10-31付）: 開催終了したLIVEでは「参加予定：○名」ではなく
--   「参加者：○名」を表示し、その人数は status='attended'（参加済み）の
--   件数とする。既存の get_event_participant_count()（status='going'の件数、
--   20261028000000で作成）は開催予定LIVE向けのまま変更せず、本migrationは
--   新しいfunctionを追加するのみとする。
--
-- 対象: public.get_event_attendee_count() の作成とEXECUTE ACLのみ。
--   event_participants / events のtable・列・制約・index・trigger・RLS・
--   policy・ACL、get_event_participant_count()を含む他のfunction・table・
--   default privilegeは変更しない。
--
-- get_event_attendee_count(target_event_id) -> integer
--   - 対象eventが公開中（events_select_public / get_event_participant_count()
--     と全く同じ条件: status='public' または (status='cancelled' かつ
--     first_published_at is not null)）の場合のみカウントを返す。それ以外
--     （draft・一度も公開されていないcancelled・不存在）は0を返す（存在の
--     有無を漏らさない）。
--   - カウント対象: event_participants.status = 'attended' の行のみ。
--     visibility列は条件に使わない（get_event_participant_count()と同じ
--     PM確定方針を踏襲）。
--   - profilesの状態（active/suspended/banned）やblock関係は条件にしない —
--     人数のみの集計であり、個人の特定・一覧化を伴わないため。
--   - anon・authenticated（アカウントの状態を問わない）の全員が実行できる
--     （/live/[id]自体が未ログインでも閲覧できる公開ページのため）。
--
-- SECURITY DEFINER（owner=postgres）/ STABLE / search_path=''。
--   dynamic SQLは使用しない。
-- ACL: PUBLIC / service_role からEXECUTEを取り消し、anon・authenticatedに
--   付与する。
-- 001〜042は変更しない。
-- =============================================================================

create function public.get_event_attendee_count(
  target_event_id uuid
)
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if not exists (
    select 1
    from public.events as e
    where e.id = get_event_attendee_count.target_event_id
      and (
        e.status = 'public'
        or (e.status = 'cancelled' and e.first_published_at is not null)
      )
  ) then
    return 0;
  end if;

  select count(*)
    into v_count
    from public.event_participants as ep
    where ep.event_id = get_event_attendee_count.target_event_id
      and ep.status = 'attended';

  return v_count;
end;
$$;

revoke execute on function public.get_event_attendee_count(uuid) from public;
revoke execute on function public.get_event_attendee_count(uuid) from service_role;
grant execute on function public.get_event_attendee_count(uuid) to anon;
grant execute on function public.get_event_attendee_count(uuid) to authenticated;
-- =============================================================================
