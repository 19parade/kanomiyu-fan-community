-- =============================================================================
-- 20261108020000_news_public_detail.sql
-- WHAT'S NEW機能: newsの公開詳細 public.get_public_news_item()
--
-- 対象: public.get_public_news_item() の作成とEXECUTE ACLのみ。他のtable・
--   function・RLS・ACLは変更しない。
--
-- get_public_news_item(target_news_id) -> TABLE (id, title, content,
--   source_url, published_at)
--   - anon・authenticatedの全員が実行できる。
--   - 返す行の条件: id一致 かつ status = 'published' かつ
--     published_at <= now() かつ content is not null。
--     content が NULL（本文なし・リンクのみパターン）の記事は、PM仕様上
--     詳細ページ自体を経由しない設計（トップページはsource_urlへ直接遷移
--     する）ため、このRPCでは意図的に0行を返す — draft・未公開・
--     本文なしは全て同じ「0行」で、存在するか・どの理由で見えないかを
--     区別しない（/music/[id]のget_public_songと同じnot-found設計）。
--   - 不正なUUID文字列は、関数の本体に入る前にPostgreSQLの型変換エラー
--     （22P02）になり得る。
--
-- SECURITY DEFINER（owner=postgres）/ STABLE / search_path=''。
-- ACL: PUBLIC / service_role からEXECUTEを取り消し、anon・authenticatedに
--   付与する。
-- =============================================================================

create function public.get_public_news_item(
  target_news_id uuid
)
returns table (
  id uuid,
  title text,
  content text,
  source_url text,
  published_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return query
    select
      n.id,
      n.title,
      n.content,
      n.source_url,
      n.published_at
    from public.news as n
    where n.id = get_public_news_item.target_news_id
      and n.status = 'published'
      and n.published_at <= now()
      and n.content is not null;
end;
$$;

alter function public.get_public_news_item(uuid) owner to postgres;

revoke execute on function public.get_public_news_item(uuid) from public;
revoke execute on function public.get_public_news_item(uuid) from service_role;
grant execute on function public.get_public_news_item(uuid) to anon;
grant execute on function public.get_public_news_item(uuid) to authenticated;
