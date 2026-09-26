-- =============================================================================
-- 20260927190000_events_public_read.sql
-- events の公開SELECT境界 (M11)
--
-- 対象: public.events の「公開されたeventを誰でもSELECTできる」row visibility
--   のみ。M9でdeny-by-default（RLS有効・policy 0件・anon/authenticated権限なし）に
--   した状態から、公開に必要なSELECTだけを開く。
--   - anon / authenticated への SELECT GRANT
--   - policy events_select_public（FOR SELECT TO anon, authenticated）
--
-- 公開条件（PM確定）:
--     status = 'public'
--     OR (status = 'cancelled' AND first_published_at IS NOT NULL)
--   - public                                   -> 常に公開
--   - cancelled かつ first_published_at 非NULL -> 一度公開されたeventなので、
--                                                 中止後も公開を継続する
--   - cancelled かつ first_published_at NULL   -> 一度も公開されていないため非公開
--   - draft                                    -> 非公開
--   event_date（過去か未来か）は公開条件に使用しない。過去のLIVEも公開DBの
--   資産として残す。first_published_at はDBのtrigger（events_guard_publish_state）
--   が管理する値で、クライアントは指定できない。
--
-- 利用者の状態（active / suspended / banned / profile不在 / uid NULL）や
--   adminかどうかによって公開rowの見え方は変えない（eventsはログアウトしても
--   閲覧できる公開情報のため）。active adminも本migration後は一般ユーザーと同じ
--   公開rowのみをbase SELECTできる（adminの全件SELECTは別migrationで実装する）。
--   draftや一度も公開されていないcancelled、不存在のidは、いずれも0行となり区別できない。
--
-- 含めないもの: adminのSELECT policy、INSERT / UPDATE / DELETE の権限・policy
--   （anon / authenticated のwriteはM9のまま全拒否）、event管理RPC、
--   admin_logs連携、event_participants / posts / news / songs、Storage。
--   postgres / service_role のACL、trigger、function、default privilegeは変更しない。
--
-- 注意: 本migrationはrowの公開範囲のみを扱う。base table SELECTのため、公開rowでは
--   全列（created_by・created_at・updated_at・first_published_at を含む）が
--   取得可能になる。これらの内部列を公開してよいかは未決定事項として残しており、
--   本migrationで公開列の境界を確定したものではない。
-- 001〜026は変更しない。
-- =============================================================================

grant select on table public.events to anon;
grant select on table public.events to authenticated;

create policy events_select_public
  on public.events
  for select
  to anon, authenticated
  using (
    status = 'public'
    or (
      status = 'cancelled'
      and first_published_at is not null
    )
  );
