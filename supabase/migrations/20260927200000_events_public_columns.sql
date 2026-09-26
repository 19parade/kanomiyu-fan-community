-- =============================================================================
-- 20260927200000_events_public_columns.sql
-- events の公開列の境界 (M12)
--
-- 背景: M11 (20260927190000_events_public_read.sql) は anon / authenticated に
--   table全体のSELECTをGRANTしたため、公開されたeventでは12列全てが取得可能だった。
--   本migrationでforward-onlyに修正し、
--     row visibility    = M11のRLS policy（変更しない）
--     column visibility = 本migrationの列単位SELECT権限
--   に分離する。M11のmigrationは編集しない。
--
-- 公開する列（PM確定・exactly 8列）:
--   id / title / venue / event_date / description / image_url / ticket_url / status
-- 公開しない列（exactly 4列）:
--   created_by / created_at / updated_at / first_published_at
--   - created_by: 公開すると、作成者として現れるaccountがadminであることが特定でき、
--     公開プロフィールでroleを隠している設計を崩すため。
--   - created_at / updated_at / first_published_at: 公開画面での表示要件がなく、
--     データ最小化のため。first_published_at はRLS policyの内部でのみ参照する
--     （clientへ返す必要はない。列のSELECT権限がなくてもpolicyは評価される。
--     probeで実DBにて確認済み）。
--
-- 変更点:
--   - anon / authenticated の table単位SELECT を REVOKE
--   - 公開8列のみ、anon / authenticated に列単位SELECTをGRANT
--   これにより、今後eventsへ列が追加されても、明示的にGRANTしない限り公開されない。
--
-- 結果（クライアント側の注意）:
--   - 公開8列を明示したSELECTのみ成功する。`SELECT *`（および非公開列を1つでも含む
--     SELECT）は permission denied になる。アプリ（Next.js）は公開8列を明示して取得する。
--   - 列権限はロール単位のため、admin（authenticatedロール）もbase tableから取得できるのは
--     公開8列のみ。adminの全件・内部列の読み取りは別の専用read boundaryで実装する。
--
-- 変更しないもの: RLS policy（events_select_public）、RLS状態、INSERT / UPDATE /
--   DELETE 等のwrite権限（anon / authenticated には付与しない。列単位のwriteも付与しない）、
--   postgres / service_role のACL、function、trigger、default privilege、他table。
-- 001〜027は変更しない。
-- =============================================================================

revoke select on table public.events from anon;
revoke select on table public.events from authenticated;

grant select (
  id,
  title,
  venue,
  event_date,
  description,
  image_url,
  ticket_url,
  status
) on public.events to anon;

grant select (
  id,
  title,
  venue,
  event_date,
  description,
  image_url,
  ticket_url,
  status
) on public.events to authenticated;
