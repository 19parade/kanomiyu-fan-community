-- =============================================================================
-- 20261108070000_news_admin_delete.sql
-- WHAT'S NEW機能: newsのadmin削除 public.delete_news()
--
-- 対象: public.delete_news() の作成とEXECUTE ACLのみ。
--
-- 背景: events/songsはいずれも物理DELETEのRPCを持たない（方針未決定の
--   まま）が、今回のPM依頼は「削除（削除前に確認画面を表示）」を明示的に
--   要件としており、news記事は他テーブルから参照されない独立したお知らせ
--   （postsのevent_idのような被参照関係を持たない）ため、物理DELETEを
--   安全に実装できると判断した。確認画面はフロント側（管理画面UI）の
--   責務とし、このRPC自体は確認を行わない（渡された1件を即削除する）。
--
-- delete_news(target_news_id) -> void
--   - public.is_admin()（active adminのみ）でなければ NEWS_MANAGEMENT_NOT_AUTHORIZED。
--   - 対象が存在しなければ NEWS_NOT_FOUND。
--   - 物理DELETE。admin_logsへ1行（action='delete_news'、target_type='news'、
--     target_id=削除した記事のid、detail={"title":"..."}）を同一
--     トランザクションで記録する（news自体は削除済みのため、admin_logs.
--     target_idはFK制約を持たない既存設計〔6.11〕により問題なく記録できる）。
--   - バージョン確認（expected_updated_at）は行わない（物理削除であり、
--     楽観的同時実行制御の対象となる「内容の食い違い」が意味を持たない
--     ため。二重削除は2回目がNEWS_NOT_FOUNDになるだけで安全）。
--
-- SECURITY DEFINER（owner=postgres）/ search_path=''。
-- ACL: PUBLIC / anon / service_role からEXECUTEを取り消し、authenticatedに
--   付与する。
-- =============================================================================

create function public.delete_news(
  target_news_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin_id uuid := auth.uid();
  v_title text;
begin
  if not public.is_admin() then
    raise exception 'NEWS_MANAGEMENT_NOT_AUTHORIZED';
  end if;

  delete from public.news
    where id = delete_news.target_news_id
    returning title into v_title;

  if not found then
    raise exception 'NEWS_NOT_FOUND';
  end if;

  insert into public.admin_logs (admin_id, action, target_type, target_id, detail)
  values (
    v_admin_id,
    'delete_news',
    'news',
    delete_news.target_news_id,
    jsonb_build_object('title', v_title)
  );
end;
$$;

alter function public.delete_news(uuid) owner to postgres;

revoke execute on function public.delete_news(uuid) from public;
revoke execute on function public.delete_news(uuid) from anon;
revoke execute on function public.delete_news(uuid) from service_role;
grant execute on function public.delete_news(uuid) to authenticated;
