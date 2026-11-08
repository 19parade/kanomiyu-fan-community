-- =============================================================================
-- 20261108040000_news_admin_detail.sql
-- WHAT'S NEW機能: newsのadmin詳細 public.get_admin_news_item()
--
-- 対象: public.get_admin_news_item() の作成とEXECUTE ACLのみ。
--
-- get_admin_news_item(target_news_id) -> TABLE (id, title, content,
--   source_url, status, published_at, created_by, created_at, updated_at)
--   - public.is_admin()（active adminのみ）でなければ NEWS_MANAGEMENT_NOT_AUTHORIZED。
--   - status・published_atに関係なく、id一致の1行を返す（draft・未来公開も
--     含む。管理の編集画面用）。
--   - 全9列を返す（本文・リンクURLの実際の値を含む。編集フォームの
--     初期値に必要なため、一覧RPCとは異なりデータ最小化しない）。
--
-- SECURITY DEFINER（owner=postgres）/ STABLE / search_path=''。
-- ACL: PUBLIC / anon / service_role からEXECUTEを取り消し、authenticatedに
--   付与する。
-- =============================================================================

create function public.get_admin_news_item(
  target_news_id uuid
)
returns table (
  id uuid,
  title text,
  content text,
  source_url text,
  status text,
  published_at timestamptz,
  created_by uuid,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'NEWS_MANAGEMENT_NOT_AUTHORIZED';
  end if;

  return query
    select
      n.id,
      n.title,
      n.content,
      n.source_url,
      n.status,
      n.published_at,
      n.created_by,
      n.created_at,
      n.updated_at
    from public.news as n
    where n.id = get_admin_news_item.target_news_id;
end;
$$;

alter function public.get_admin_news_item(uuid) owner to postgres;

revoke execute on function public.get_admin_news_item(uuid) from public;
revoke execute on function public.get_admin_news_item(uuid) from anon;
revoke execute on function public.get_admin_news_item(uuid) from service_role;
grant execute on function public.get_admin_news_item(uuid) to authenticated;
