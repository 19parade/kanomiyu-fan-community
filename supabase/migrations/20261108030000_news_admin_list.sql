-- =============================================================================
-- 20261108030000_news_admin_list.sql
-- WHAT'S NEW機能: newsのadmin一覧 public.get_admin_news()
--
-- 対象: public.get_admin_news() の作成とEXECUTE ACLのみ。newsのbase table
--   は引き続きクライアントから全拒否（adminを含め、admin一覧もこの
--   SECURITY DEFINER RPC経由のみ）。
--
-- get_admin_news(status_filter, page_size, after_published_at, after_id)
--   -> TABLE (id uuid, title text, published_at timestamptz, status text,
--             has_content boolean, has_link boolean, updated_at timestamptz)
--   - public.is_admin()（active adminのみ）でなければ NEWS_MANAGEMENT_NOT_AUTHORIZED。
--   - draft・published の両方を、published_at（未来・過去）に関係なく返す
--     （公開範囲の述語は適用しない。管理用のtrustedな境界）。
--   - 返す列は7列。本文・リンクURLそのものは返さず、has_content /
--     has_link（いずれも真偽値）のみ返す（一覧画面の要件「本文の有無」
--     「リンクURLの有無」を満たす最小限の列。全文は詳細取得で別途行う）。
--   - status_filter: NULL / 'draft' / 'published' の完全一致のみ
--     （それ以外はINVALID_NEWS_STATUS_FILTER）。
--   - 並び順: published_at DESC NULLS LAST, id DESC（日付の新しい順。
--     published_at がNULLの行は現在のUI経由では作られないが、防御的に
--     NULLS LASTで末尾に回す）。
--   - cursor（keyset）: get_public_news()と同じ規則。
--       after_id NULL かつ after_published_at NULL: 先頭ページ
--       after_id NULL かつ after_published_at 非NULL: INVALID_NEWS_CURSOR
--       after_id 非NULL かつ after_published_at 非NULL: published_at ありの
--         区間のcursor（published_at < D、または published_at = D かつ
--         id < I、または published_at IS NULL）
--       after_id 非NULL かつ after_published_at NULL: published_at NULLの
--         区間のcursor（published_at IS NULL かつ id < I）
--   - page_size: NULLなら50、それ以外は1〜100へclamp。
--   - 検証の順序: 認可 -> status_filter -> cursor -> page_size。
--   - admin_logsには記録しない（read-only）。
--
-- SECURITY DEFINER（owner=postgres）/ STABLE / search_path=''。
-- ACL: PUBLIC / anon / service_role からEXECUTEを取り消し、authenticatedに
--   付与する。
-- =============================================================================

create function public.get_admin_news(
  status_filter text default null,
  page_size integer default 50,
  after_published_at timestamptz default null,
  after_id uuid default null
)
returns table (
  id uuid,
  title text,
  published_at timestamptz,
  status text,
  has_content boolean,
  has_link boolean,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_page_size integer;
begin
  if not public.is_admin() then
    raise exception 'NEWS_MANAGEMENT_NOT_AUTHORIZED';
  end if;

  if get_admin_news.status_filter is not null
     and get_admin_news.status_filter not in ('draft', 'published') then
    raise exception 'INVALID_NEWS_STATUS_FILTER';
  end if;

  if get_admin_news.after_id is null and get_admin_news.after_published_at is not null then
    raise exception 'INVALID_NEWS_CURSOR';
  end if;

  v_page_size := least(greatest(coalesce(get_admin_news.page_size, 50), 1), 100);

  return query
    select
      n.id,
      n.title,
      n.published_at,
      n.status,
      (n.content is not null) as has_content,
      (n.source_url is not null) as has_link,
      n.updated_at
    from public.news as n
    where (get_admin_news.status_filter is null or n.status = get_admin_news.status_filter)
      and (
        get_admin_news.after_id is null
        or (
          get_admin_news.after_published_at is not null
          and (
            n.published_at < get_admin_news.after_published_at
            or (
              n.published_at = get_admin_news.after_published_at
              and n.id < get_admin_news.after_id
            )
            or n.published_at is null
          )
        )
        or (
          get_admin_news.after_published_at is null
          and n.published_at is null
          and n.id < get_admin_news.after_id
        )
      )
    order by n.published_at desc nulls last, n.id desc
    limit v_page_size;
end;
$$;

alter function public.get_admin_news(text, integer, timestamptz, uuid) owner to postgres;

revoke execute on function public.get_admin_news(text, integer, timestamptz, uuid) from public;
revoke execute on function public.get_admin_news(text, integer, timestamptz, uuid) from anon;
revoke execute on function public.get_admin_news(text, integer, timestamptz, uuid) from service_role;
grant execute on function public.get_admin_news(text, integer, timestamptz, uuid) to authenticated;
