-- =============================================================================
-- 20260922081159_blocks_rls.sql
-- blocks RLS - RLS ENABLE + 最小権限GRANT/REVOKE
--
-- 対象（本migrationに含まれるもの）:
--   - public.blocks: anon/authenticatedのtable-level ACL最小化
--   - public.blocks: ENABLE ROW LEVEL SECURITY（FORCE RLSは使用しない）
--   - policy 3件: blocks_select_own / blocks_insert_own / blocks_delete_own
--
-- 本migrationに含まれないもの:
--   - internal.is_blocked_with()（変更禁止・無変更）
--   - profiles（4a適用済み・変更禁止・無変更）
--   - posts/comments/likes/events/event_participants/reports/news/songs/
--     admin_logs/login_attempts/app_settingsのRLS
--   - 新しいtrigger/function/RPC/helper
--   - index追加（懸念事項として後述のみ）
--
-- 20260920022832_core_schema.sql（001）〜20260922075059_profiles_rls_4a.sql（009）
-- はいずれも変更しない。
--
-- -----------------------------------------------------------------------------
-- 実装前に読み取り専用で確認した事実（前回調査からdriftなし）:
--   - public.blocks の owner = postgres。RLS無効、policy 0件。
--   - 現在のACL: anon/authenticated/postgres/service_role いずれも
--     DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE
--     （table-level、全列）を保持。
--   - blocks_no_self_block_check（CHECK (blocker_id <> blocked_id)）が
--     既存制約として存在する。self-block防止は本制約にすべて委ね、
--     本migrationでは新しいRLS条件・CHECK制約は追加しない。
--   - internal.is_blocked_with(uuid) は owner=postgres・SECURITY DEFINER・
--     search_path=''・ACLはauthenticated/postgresのみ、無変更。
--   - postgres は rolbypassrls=true。internal schema ACLも無変更。
--   - profiles は4a適用済みの状態（RLS有効、policy 3件、ACL最小化）を維持。
--
-- postgresのBYPASSRLSにより、internal.is_blocked_with()は本migrationによる
-- blocks RLS ENABLE後も、その内部SELECTがRLSを迂回し続けるため、双方向
-- （caller→target、target→caller）の判定を引き続き正しく行う。
-- -----------------------------------------------------------------------------


-- -----------------------------------------------------------------------------
-- anon: blocksへの全権限を明示的にREVOKEする。anon向けpolicyは作成しない。
-- -----------------------------------------------------------------------------
revoke all on table public.blocks from anon;


-- -----------------------------------------------------------------------------
-- authenticated: 広いtable-level権限を一度すべて取り消してから、
-- SELECT/INSERT/DELETEのみを再付与する。UPDATEは許可しない
-- （blocksはblock=INSERT・unblock=DELETEで完結し、UPDATEという操作概念を
-- 持たないため。column-level UPDATE GRANTも行わない）。
-- -----------------------------------------------------------------------------
revoke all on table public.blocks from authenticated;

grant select, insert, delete
  on table public.blocks
  to authenticated;


-- -----------------------------------------------------------------------------
-- RLSを有効化する。FORCE ROW LEVEL SECURITYは使用しない
-- （owner=postgresはBYPASSRLSのため、internal.is_blocked_with()の動作に
-- 影響しない）。
-- -----------------------------------------------------------------------------
alter table public.blocks enable row level security;


-- -----------------------------------------------------------------------------
-- blocks_select_own: 本人が自分がblockerである行のみSELECT可能。
-- blocked_id = auth.uid() は条件に含めない（「誰から自分がblockされて
-- いるか」を本人にも直接公開しない設計）。第三者同士のblock関係も
-- 取得不可。active/suspended/banned問わず（statusによる制限なし。
-- blockは安全機能として全statusで利用可能という確定方針のため、
-- is_active_user()等は参照しない）。
-- -----------------------------------------------------------------------------
create policy blocks_select_own
  on public.blocks
  for select
  to authenticated
  using (
    blocker_id = auth.uid()
  );


-- -----------------------------------------------------------------------------
-- blocks_insert_own: 本人だけが、自分をblockerとするblockを作成できる。
-- active/suspended/banned問わず作成可能（block作成は安全機能として扱う
-- という確定方針のため、is_active_user()・is_community_browsing_allowed()
-- は条件に含めない）。self-block防止は既存のblocks_no_self_block_check
-- CHECK制約にすべて委ねる（本policyでは判定しない）。
-- -----------------------------------------------------------------------------
create policy blocks_insert_own
  on public.blocks
  for insert
  to authenticated
  with check (
    blocker_id = auth.uid()
  );


-- -----------------------------------------------------------------------------
-- blocks_delete_own: 本人が作成したblockのみ解除（DELETE）できる。
-- active/suspended/banned問わず（unblockは縮小操作として全statusで許可）。
-- -----------------------------------------------------------------------------
create policy blocks_delete_own
  on public.blocks
  for delete
  to authenticated
  using (
    blocker_id = auth.uid()
  );

-- UPDATE policyは作成しない（13節参照）。admin専用policyも今回は作成しない
-- （現時点で具体的なmoderationユースケースが定義されていないため。is_admin()
-- はこのmigrationで一切参照しない）。
-- =============================================================================
