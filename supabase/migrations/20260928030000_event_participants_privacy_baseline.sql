-- =============================================================================
-- 20260928030000_event_participants_privacy_baseline.sql
-- event_participants の privacy baseline (M19): 本人のSELECT・active adminのSELECT・
--   visibility default を private へ
--
-- 対象: public.event_participants の visibility default（public -> private）、
--   authenticatedへの列単位のSELECT権限、SELECT policy 2本のみ。
--   CHECK制約（status / visibility）・UNIQUE・PK・FK・index・trigger・列は変更しない。
--   他のtable・function・default privilege・events / postsの境界も変更しない。
--   新しいhelper・trigger・RPC・列（updated_at等）は追加しない。
--
-- 1. visibility default: 'public' -> 'private'（privacy-by-default）。既存行は更新しない
--    （適用時点で0行）。visibility CHECK（public / private / attended）は変更しない。
-- 2. authenticated へ、現在の6列（id / event_id / user_id / status / visibility /
--    created_at）の列単位のSELECT権限のみを付与する。INSERT / UPDATE / DELETE /
--    TRUNCATE / REFERENCES / TRIGGER は付与しない。anon には何も付与しない。
-- 3. event_participants_select_own: user_id = auth.uid() の行を、eventの状態・行の
--    status・visibility・自分のprofiles.status（active / suspended / banned）に関係なく
--    読める（自分自身の保存データへのアクセス。write/discoveryの権限とは分離する）。
-- 4. event_participants_select_admin: public.is_admin()（active adminのみ）は全行を読める。
--
-- 他人の行は、visibilityの値に関係なくbase tableから読めない（0行）。他人向けの参加者
--   一覧はこのmigrationの範囲外。参加登録・変更・取消のwrite pathも存在しない
--   （adminを含め、authenticatedからのINSERT / UPDATE / DELETEは不可）。
-- service_role / postgres の権限は変更しない。001〜034は変更しない。
-- =============================================================================

alter table public.event_participants
  alter column visibility set default 'private';

grant select (id, event_id, user_id, status, visibility, created_at)
  on public.event_participants
  to authenticated;

create policy event_participants_select_own
  on public.event_participants
  for select
  to authenticated
  using (user_id = auth.uid());

create policy event_participants_select_admin
  on public.event_participants
  for select
  to authenticated
  using (public.is_admin());
