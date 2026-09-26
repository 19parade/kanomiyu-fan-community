-- =============================================================================
-- 20260927130000_get_my_reports_rpc.sql
-- 自分の通報履歴RPC (M5): public.get_my_reports(after_created_at, after_id, page_size)
--
-- 対象: public.get_my_reports() の作成とEXECUTE ACLのみ。
--   reports のtable ACL / RLS / policy / trigger / CHECK / index、および
--   create_report() を含む他のRPC・helperは変更しない。
--
-- 目的（PROJECT_SPEC.md 6.7・v1.19）:
--   通報者本人が、自分の通報履歴だけを安全なprojectionで取得する。
--   reports本体にreporter向けSELECT policyは作らず、reporterの読み取り経路は
--   本RPCのみとする。
--
-- 設計:
--   - SECURITY DEFINER（owner=postgres）のためreportsのRLSをbypassする。
--     したがって WHERE r.reporter_id = auth.uid() がsecurity boundaryである。
--     admin向けの分岐は持たない（adminも自分の通報のみ。全件閲覧は
--     reports_select_admin によるbase-table SELECTの別責務）。
--   - 返却列は id / target_type / target_id / reason / detail / status /
--     created_at / updated_at / handled_at のみ。reporter_id と handled_by は
--     戻り値の型にも含めない。
--   - 認可: auth.uid() が非NULL、かつ対応するprofilesの行が存在すること。
--     満たさなければ REPORT_NOT_AUTHORIZED（fail closed）。profileのstatusは
--     問わない（active / suspended / banned いずれも既存の自分の通報を閲覧可能）。
--     create_report() と異なり is_active_user() は要求しない。
--   - posts / comments / profiles / blocks へはJOINしない。通報後にtargetが
--     hidden / deleted / banned / block済み / 不存在になっても履歴は返す。
--   - 並び順: created_at DESC, id DESC。keyset pagination
--     （(created_at, id) < (after_created_at, after_id)）。
--     cursorは実在するrowである必要はなく、単なる境界として扱う（存在oracleを作らない）。
--     after_created_at / after_id は両方NULL（先頭ページ）か両方非NULL（次ページ）。
--     片方のみ非NULLは INVALID_REPORT_CURSOR。
--   - page_size: NULL→20、1未満→1、100超→100（エラーにせずclamp）。
--   - 0件は正常系（0 rows）。
--
-- 出力列名がreportsの列名と同一のため、SELECT内では必ずtable alias(r.)で修飾する。
-- ACL: PUBLIC / anon からEXECUTEを取り消し、authenticatedに付与する。
--   service_role は publicスキーマのdefault privilegeにより自動付与される
--   （既存RPCと同じ既知の挙動）。service_roleはauth.uid()がNULLのため関数内で拒否される。
-- 001〜020は変更しない。
-- =============================================================================

create function public.get_my_reports(
  after_created_at timestamptz default null,
  after_id uuid default null,
  page_size integer default 20
)
returns table (
  id uuid,
  target_type text,
  target_id uuid,
  reason text,
  detail text,
  status text,
  created_at timestamptz,
  updated_at timestamptz,
  handled_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_viewer_id uuid := auth.uid();
  v_page_size integer;
  v_has_profile boolean;
begin
  if v_viewer_id is null then
    raise exception 'REPORT_NOT_AUTHORIZED';
  end if;

  select exists (
    select 1
    from public.profiles pr
    where pr.id = v_viewer_id
  ) into v_has_profile;

  if not v_has_profile then
    raise exception 'REPORT_NOT_AUTHORIZED';
  end if;

  if (get_my_reports.after_created_at is null) <> (get_my_reports.after_id is null) then
    raise exception 'INVALID_REPORT_CURSOR';
  end if;

  v_page_size := least(greatest(coalesce(get_my_reports.page_size, 20), 1), 100);

  return query
    select
      r.id,
      r.target_type,
      r.target_id,
      r.reason,
      r.detail,
      r.status,
      r.created_at,
      r.updated_at,
      r.handled_at
    from public.reports as r
    where r.reporter_id = v_viewer_id
      and (
        get_my_reports.after_created_at is null
        or (r.created_at, r.id) < (get_my_reports.after_created_at, get_my_reports.after_id)
      )
    order by r.created_at desc, r.id desc
    limit v_page_size;
end;
$$;

revoke execute on function public.get_my_reports(timestamptz, uuid, integer) from public;
revoke execute on function public.get_my_reports(timestamptz, uuid, integer) from anon;
grant execute on function public.get_my_reports(timestamptz, uuid, integer) to authenticated;
