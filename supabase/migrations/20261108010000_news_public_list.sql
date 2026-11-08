-- =============================================================================
-- 20261108010000_news_public_list.sql
-- WHAT'S NEW機能: newsの公開一覧 public.get_public_news()
--
-- 対象: public.get_public_news() の作成とEXECUTE ACLのみ。news のtable・列・
--   制約・index・trigger・RLS・ACL、他のfunction・table・default privilegeは
--   変更しない。newsのbase tableは引き続きクライアントから全拒否（songsと
--   同じ方針。RLS policyは一切作らず、公開read・admin read・write全てを
--   SECURITY DEFINER RPC経由にする）。
--
-- get_public_news(page_size, after_published_at, after_id)
--   -> TABLE (id uuid, title text, published_at timestamptz, source_url text,
--             has_content boolean)
--   - anon・authenticated（account statusに関係なく）の全員が実行できる。
--   - 返す行は status = 'published' かつ published_at <= now() のみ。
--   - 返す列は5列。本文（content）はデータ最小化のため返さず、代わりに
--     has_content（content is not null）のみ返す — トップページはタイトルと
--     日付・リンク可否さえ分かればよく、本文全文は詳細ページ
--     （get_public_news_item）で別途取得する。
--   - 並び順: published_at DESC, id DESC（日付が同じでも表示順が安定する
--     よう、idを常にtie-breakに使う。PM指示の「表示順の安定」要件）。
--   - cursor（keyset）: 将来の一覧ページ追加に備えた設計（今回は一覧ページ
--     自体は新設しない）。after_id IS NULL で先頭ページ判定。
--       after_id NULL かつ after_published_at NULL: 先頭ページ
--       after_id NULL かつ after_published_at 非NULL: INVALID_NEWS_CURSOR
--       両方非NULL: (published_at, id) < (after_published_at, after_id)
--     cursorが実在する記事か・公開済みかは検証しない。
--   - page_size: NULLなら5（トップページの「最新5件」要件のデフォルト）、
--     それ以外は1〜20へclamp。
--   - 件数（total_count）は提供しない。admin_logsには記録しない（read-only）。
--
-- SECURITY DEFINER（owner=postgres）/ STABLE / search_path=''。全参照は
--   schema修飾。dynamic SQLは使用しない。
-- ACL: PUBLIC / service_role からEXECUTEを取り消し、anon・authenticatedに
--   付与する（postgresはownerとしてEXECUTEを持つ）。
-- =============================================================================

create function public.get_public_news(
  page_size integer default 5,
  after_published_at timestamptz default null,
  after_id uuid default null
)
returns table (
  id uuid,
  title text,
  published_at timestamptz,
  source_url text,
  has_content boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_page_size integer;
begin
  if get_public_news.after_id is null and get_public_news.after_published_at is not null then
    raise exception 'INVALID_NEWS_CURSOR';
  end if;

  v_page_size := least(greatest(coalesce(get_public_news.page_size, 5), 1), 20);

  return query
    select
      n.id,
      n.title,
      n.published_at,
      n.source_url,
      (n.content is not null) as has_content
    from public.news as n
    where n.status = 'published'
      and n.published_at <= now()
      and (
        get_public_news.after_id is null
        or (n.published_at, n.id) < (get_public_news.after_published_at, get_public_news.after_id)
      )
    order by n.published_at desc, n.id desc
    limit v_page_size;
end;
$$;

alter function public.get_public_news(integer, timestamptz, uuid) owner to postgres;

revoke execute on function public.get_public_news(integer, timestamptz, uuid) from public;
revoke execute on function public.get_public_news(integer, timestamptz, uuid) from service_role;
grant execute on function public.get_public_news(integer, timestamptz, uuid) to anon;
grant execute on function public.get_public_news(integer, timestamptz, uuid) to authenticated;
