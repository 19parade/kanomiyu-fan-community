-- =============================================================================
-- 20260927100000_reports_rate_limit_trigger.sql
-- reports 通報レート制限 (M2): 同一reporter_id あたり 5件 / rolling 10分
--
-- 対象:
--   - internal.enforce_report_rate_limit()（trigger function）
--   - reports_enforce_rate_limit（BEFORE INSERT FOR EACH ROW）
--
-- 仕様（PROJECT_SPEC.md 8章・v1.19）: 通報の作成は 5回 / 10分。
--   直近10分に同一reporter_idの既存reportsが5件以上ある場合、6件目を
--   REPORT_RATE_LIMITED で拒否する。statusは問わずcountする。
--
-- 設計:
--   - table-level BEFORE INSERT trigger（将来のcreate_report()だけでなく、
--     owner/service_role等の直接INSERTにも発火する最終防衛線）。
--   - 同時実行対策: 同一reporterのINSERTを pg_advisory_xact_lock で直列化する。
--     lock keyは 'report_rate_limit:'||reporter_id のmd5先頭64bitをbigintへ
--     変換（標準の決定論的関数のみ使用。セッション/再起動に依存しない）。
--     別reporterは通常別keyとなり不要に直列化されない。UUID(128bit)を
--     64bitへ縮約するため理論上のcollisionはあり得るが、その場合は別reporter
--     が一時的に直列化されるだけで、制限の回避にはならない。
--   - count条件: created_at >= now() - interval '10 minutes'。now()は
--     transaction開始時刻で、created_atの既定値(now())と同じ時刻源。
--     ちょうど10分前の行はwindow内としてcountされる。NEW.created_atは判定に
--     使用しない（既存行のみをcountする）。
--   - SECURITY DEFINER（owner=postgres, search_path=''）: 将来reportsにRLSを
--     有効化しても、INSERT実行roleのRLSにcountが影響されない（invoker権限だと
--     SELECT policyにより0件と数えてlimitを回避され得る）ため。
--   - function は internal schema に置き、EXECUTEはpostgresのみ
--     （PUBLIC/anon/authenticated/service_roleから取り消し）。trigger発火に
--     EXECUTE権限は不要であることを実DBで確認済み。
--   - 既存のtable ACL/RLS/policyは一切変更しない。
--
-- 001〜017は変更しない。
-- =============================================================================

create function internal.enforce_report_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  perform pg_advisory_xact_lock(
    ('x' || substr(md5('report_rate_limit:' || new.reporter_id::text), 1, 16))::bit(64)::bigint
  );

  select count(*)
    into v_count
    from public.reports r
    where r.reporter_id = new.reporter_id
      and r.created_at >= now() - interval '10 minutes';

  if v_count >= 5 then
    raise exception 'REPORT_RATE_LIMITED';
  end if;

  return new;
end;
$$;

revoke all on function internal.enforce_report_rate_limit() from public;
revoke all on function internal.enforce_report_rate_limit() from anon;
revoke all on function internal.enforce_report_rate_limit() from authenticated;
revoke all on function internal.enforce_report_rate_limit() from service_role;

create trigger reports_enforce_rate_limit
  before insert on public.reports
  for each row
  execute function internal.enforce_report_rate_limit();
