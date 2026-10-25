-- =============================================================================
-- 20261028000000_event_participant_count.sql
-- /live/[id] の「参加予定：○名」表示用: public.get_event_participant_count()
--
-- PM確定方針（2026-10-28付）: visibilityに関わらず、status='going'の全行を
--   カウントする（人数のみの公開であり、誰が参加するかを明かすものではない
--   ため、M19のvisibility privacy-by-defaultとは別の判断とする）。
--
-- 対象: public.get_event_participant_count() の作成とEXECUTE ACLのみ。
--   event_participants / events のtable・列・制約・index・trigger・RLS・
--   policy・ACL、他のfunction・table・default privilegeは変更しない。
--
-- get_event_participant_count(target_event_id) -> integer
--   - 対象eventが公開中（events_select_public と全く同じ条件: status='public'
--     または (status='cancelled' かつ first_published_at is not null)）の
--     場合のみカウントを返す。それ以外（draft・一度も公開されていない
--     cancelled・不存在）は 0 を返す（存在の有無を漏らさない — events自体の
--     既存の公開境界と同じ考え方）。
--   - カウント対象: event_participants.status = 'going' の行のみ。visibility
--     列は条件に使わない（PM確定方針）。
--   - profilesの状態（active/suspended/banned）やblock関係は条件にしない —
--     人数のみの集計であり、個人の特定・一覧化を伴わないため、
--     get_event_participants()（M21、個人の一覧を返す）と同じ絞り込みを
--     適用する必要がない。
--   - anon・authenticated（アカウントの状態を問わない）の全員が実行できる
--     （/live/[id]自体が未ログインでも閲覧できる公開ページのため）。
--
-- SECURITY DEFINER（owner=postgres）/ STABLE / search_path=''。
--   dynamic SQLは使用しない。
-- ACL: PUBLIC / service_role からEXECUTEを取り消し、anon・authenticatedに
--   付与する。
-- 001〜041は変更しない。
-- =============================================================================

create function public.get_event_participant_count(
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
    where e.id = get_event_participant_count.target_event_id
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
    where ep.event_id = get_event_participant_count.target_event_id
      and ep.status = 'going';

  return v_count;
end;
$$;

revoke execute on function public.get_event_participant_count(uuid) from public;
revoke execute on function public.get_event_participant_count(uuid) from service_role;
grant execute on function public.get_event_participant_count(uuid) to anon;
grant execute on function public.get_event_participant_count(uuid) to authenticated;
-- =============================================================================
