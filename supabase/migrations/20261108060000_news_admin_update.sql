-- =============================================================================
-- 20261108060000_news_admin_update.sql
-- WHAT'S NEW機能: newsのadmin更新 public.update_news()
--
-- 対象: public.update_news() の作成とEXECUTE ACLのみ。internal.normalize_news_content()
--   （作成済み）・他のtable・function・RLS・ACLは変更しない。
--
-- update_news(target_news_id, expected_updated_at, title, published_at,
--   content, source_url, is_published) -> void
--   - public.is_admin()（active adminのみ）でなければ NEWS_MANAGEMENT_NOT_AUTHORIZED。
--   - expected_updated_at がNULLなら INVALID_NEWS_VERSION。
--   - 全項目を internal.normalize_news_content() で検証（create_newsと同じ
--     規則）。
--   - 対象を SELECT ... FOR UPDATE でlock。存在しなければ NEWS_NOT_FOUND。
--   - 現在の updated_at と expected_updated_at の完全一致チェック
--     （date_trunc・丸め・許容幅なし）。不一致は NEWS_CONFLICT
--     （events/songsの *_CONFLICT と同じ楽観的同時実行制御）。
--   - 全置換方式（NULLはクリアを意味する。部分更新モードはない）。
--     title・content・source_url・published_at・status（is_publishedから
--     導出）のいずれかが変化した場合のみUPDATEし、admin_logsへ
--     changed_fieldsを記録する。全項目が同じ場合はno-op（UPDATEせず
--     updated_atも変えずadmin_logsも書かない）。
--   - status変更もこの1回のUPDATEに含める（news専用の設計判断。
--     create_news側のコメント参照。公開⇔非公開の切り替えに
--     set_song_status/set_event_statusのような独立RPCは用意しない）。
--
-- SECURITY DEFINER（owner=postgres）/ search_path=''。
-- ACL: PUBLIC / anon / service_role からEXECUTEを取り消し、authenticatedに
--   付与する。
-- =============================================================================

create function public.update_news(
  target_news_id uuid,
  expected_updated_at timestamptz,
  title text,
  published_at timestamptz,
  content text,
  source_url text,
  is_published boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin_id uuid := auth.uid();
  v_norm record;
  v_status text := case when update_news.is_published then 'published' else 'draft' end;
  v_cur public.news%rowtype;
  v_changed text[] := array[]::text[];
begin
  if not public.is_admin() then
    raise exception 'NEWS_MANAGEMENT_NOT_AUTHORIZED';
  end if;

  if update_news.expected_updated_at is null then
    raise exception 'INVALID_NEWS_VERSION';
  end if;

  select *
    into v_norm
    from internal.normalize_news_content(
      update_news.title,
      update_news.content,
      update_news.source_url,
      update_news.published_at
    );

  select n.*
    into v_cur
    from public.news as n
    where n.id = update_news.target_news_id
    for update;

  if not found then
    raise exception 'NEWS_NOT_FOUND';
  end if;

  if v_cur.updated_at is distinct from update_news.expected_updated_at then
    raise exception 'NEWS_CONFLICT';
  end if;

  if v_norm.title is distinct from v_cur.title then
    v_changed := array_append(v_changed, 'title');
  end if;
  if v_norm.content is distinct from v_cur.content then
    v_changed := array_append(v_changed, 'content');
  end if;
  if v_norm.source_url is distinct from v_cur.source_url then
    v_changed := array_append(v_changed, 'source_url');
  end if;
  if v_norm.published_at is distinct from v_cur.published_at then
    v_changed := array_append(v_changed, 'published_at');
  end if;
  if v_status is distinct from v_cur.status then
    v_changed := array_append(v_changed, 'status');
  end if;

  if cardinality(v_changed) = 0 then
    return;
  end if;

  update public.news
    set title = v_norm.title,
        content = v_norm.content,
        source_url = v_norm.source_url,
        published_at = v_norm.published_at,
        status = v_status
    where id = update_news.target_news_id;

  insert into public.admin_logs (admin_id, action, target_type, target_id, detail)
  values (
    v_admin_id,
    'update_news',
    'news',
    update_news.target_news_id,
    jsonb_build_object('changed_fields', to_jsonb(v_changed))
  );
end;
$$;

alter function public.update_news(uuid, timestamptz, text, timestamptz, text, text, boolean) owner to postgres;

revoke execute on function public.update_news(uuid, timestamptz, text, timestamptz, text, text, boolean) from public;
revoke execute on function public.update_news(uuid, timestamptz, text, timestamptz, text, text, boolean) from anon;
revoke execute on function public.update_news(uuid, timestamptz, text, timestamptz, text, text, boolean) from service_role;
grant execute on function public.update_news(uuid, timestamptz, text, timestamptz, text, text, boolean) to authenticated;
