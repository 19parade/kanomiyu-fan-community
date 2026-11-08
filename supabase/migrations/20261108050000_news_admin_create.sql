-- =============================================================================
-- 20261108050000_news_admin_create.sql
-- WHAT'S NEW機能: newsのadmin作成 internal.normalize_news_content() /
--   public.create_news()
--
-- 対象: この2関数の作成とEXECUTE ACLのみ。newsのbase table（admin含め
--   クライアントから直接INSERT不可。作成はこのSECURITY DEFINER RPC経由
--   のみ）、他のtable・function・RLS・ACLは変更しない。
--
-- internal.normalize_news_content(p_title, p_content, p_source_url, p_published_at)
--   -> TABLE (title, content, source_url, published_at)
--   - title: 前後の空白類（U+0020・tab・LF・CR・U+3000）をtrim、1〜100文字。
--     違反は INVALID_NEWS_TITLE。
--   - content: trim後、空文字ならNULL。非NULLなら最大5000文字
--     （eventsのdescriptionと同じ上限）。違反は INVALID_NEWS_CONTENT。
--   - source_url: trim後、空文字ならNULL。非NULLなら以下のいずれかの形式
--     のみ許可する（PM依頼の「https://から始まるURL、またはサイト内の
--     安全な相対パスのみ許可し、javascript:等の危険なスキームやオープン
--     リダイレクトにつながる入力は拒否する」という明示要件を満たす）:
--       (a) 絶対URL: ticket_url/official_url（events）と同じ正規表現
--           ^https://[host必須・userinfo禁止][path/query/fragment任意]$
--       (b) サイト内相対パス: '/'で始まり、2文字目が '/' でない
--           （'//evil.com'のようなprotocol-relative URLを拒否）、かつ
--           バックスラッシュを含まない（一部ブラウザが'\'を'/'として
--           解釈し'/\evil.com'が'//evil.com'化けするトリックを拒否）
--     いずれにも制御文字・全角スペース（U+3000）を含めない。最大2048文字。
--     違反は INVALID_NEWS_SOURCE_URL。
--   - published_at: NULL不可・有限なtimestamptzのみ（この関数の呼び出し側
--     であるcreate_news/update_newsが、status（公開/非公開）に関わらず
--     常に必須として扱う — フォーム仕様「日付（必須）」のため。DB自体の
--     CHECK制約は status='published' の場合のみpublished_at必須のままで
--     変更しない）。違反は INVALID_NEWS_PUBLISHED_AT。
--   - 判定順序: title -> content -> source_url -> published_at。
--
-- public.create_news(title, published_at, content, source_url, is_published)
--   -> uuid
--   - public.is_admin()（active adminのみ）でなければ NEWS_MANAGEMENT_NOT_AUTHORIZED。
--   - is_published（デフォルトfalse）から status を決定する
--     （true -> 'published'、false -> 'draft'）。songs/eventsとは異なり、
--     「常にdraftで作成し、公開は別RPC」という段階的な方式ではなく、PM
--     依頼の登録フォーム仕様（タイトル・日付・本文・リンクURL・公開状態の
--     5項目を1つのフォームで入力する）に合わせ、作成時点で公開状態を
--     直接指定できるようにする（この点はPM判断による意図的な設計差分。
--     news専用の判断であり、songs/eventsのcreate_song/create_eventの
--     契約は一切変更しない）。
--   - created_by は auth.uid()（呼び出した管理者自身）。
--   - admin_logs へ1行（action='create_news'、detail={"to_status":...}）を
--     同一トランザクションで記録する。
--
-- SECURITY DEFINER（owner=postgres）/ search_path=''。全参照はschema修飾。
--   dynamic SQLは使用しない。
-- ACL: normalize関数はPUBLIC/anon/authenticated/service_roleすべてから
--   EXECUTEを取り消す（内部専用）。create_newsはPUBLIC/anon/service_role
--   からEXECUTEを取り消し、authenticatedに付与する。
-- =============================================================================

create function internal.normalize_news_content(
  p_title text,
  p_content text,
  p_source_url text,
  p_published_at timestamptz
)
returns table (
  title text,
  content text,
  source_url text,
  published_at timestamptz
)
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_ws constant text := chr(32) || chr(9) || chr(10) || chr(13) || chr(12288);
  v_title text;
  v_content text;
  v_source text;
begin
  v_title := btrim(p_title, v_ws);
  if v_title is null or char_length(v_title) < 1 or char_length(v_title) > 100 then
    raise exception 'INVALID_NEWS_TITLE';
  end if;

  v_content := nullif(btrim(p_content, v_ws), '');
  if v_content is not null and char_length(v_content) > 5000 then
    raise exception 'INVALID_NEWS_CONTENT';
  end if;

  v_source := nullif(btrim(p_source_url, v_ws), '');
  if v_source is not null then
    if char_length(v_source) > 2048
       or v_source ~ '[[:cntrl:]]'
       or position(chr(12288) in v_source) > 0 then
      raise exception 'INVALID_NEWS_SOURCE_URL';
    end if;

    if v_source ~ '^https://[^[:space:]/?#@:.][^[:space:]/?#@]*([/?#][^[:space:]]*)?$' then
      -- 絶対URL（https://のみ）。OK。
      null;
    elsif left(v_source, 1) = '/'
          and left(v_source, 2) <> '//'
          and position('\' in v_source) = 0 then
      -- サイト内相対パス。OK。
      null;
    else
      raise exception 'INVALID_NEWS_SOURCE_URL';
    end if;
  end if;

  if p_published_at is null or not isfinite(p_published_at) then
    raise exception 'INVALID_NEWS_PUBLISHED_AT';
  end if;

  return query select v_title, v_content, v_source, p_published_at;
end;
$$;

revoke execute on function internal.normalize_news_content(text, text, text, timestamptz) from public;
revoke execute on function internal.normalize_news_content(text, text, text, timestamptz) from anon;
revoke execute on function internal.normalize_news_content(text, text, text, timestamptz) from authenticated;
revoke execute on function internal.normalize_news_content(text, text, text, timestamptz) from service_role;


create function public.create_news(
  title text,
  published_at timestamptz,
  content text default null,
  source_url text default null,
  is_published boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin_id uuid := auth.uid();
  v_norm record;
  v_status text := case when create_news.is_published then 'published' else 'draft' end;
  v_news_id uuid;
begin
  if not public.is_admin() then
    raise exception 'NEWS_MANAGEMENT_NOT_AUTHORIZED';
  end if;

  select *
    into v_norm
    from internal.normalize_news_content(
      create_news.title,
      create_news.content,
      create_news.source_url,
      create_news.published_at
    );

  insert into public.news (title, content, source_url, status, published_at, created_by)
  values (v_norm.title, v_norm.content, v_norm.source_url, v_status, v_norm.published_at, v_admin_id)
  returning id into v_news_id;

  insert into public.admin_logs (admin_id, action, target_type, target_id, detail)
  values (
    v_admin_id,
    'create_news',
    'news',
    v_news_id,
    jsonb_build_object('to_status', v_status)
  );

  return v_news_id;
end;
$$;

alter function public.create_news(text, timestamptz, text, text, boolean) owner to postgres;

revoke execute on function public.create_news(text, timestamptz, text, text, boolean) from public;
revoke execute on function public.create_news(text, timestamptz, text, text, boolean) from anon;
revoke execute on function public.create_news(text, timestamptz, text, text, boolean) from service_role;
grant execute on function public.create_news(text, timestamptz, text, text, boolean) to authenticated;
