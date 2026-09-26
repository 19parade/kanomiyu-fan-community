-- =============================================================================
-- 20260927220000_events_admin_detail.sql
-- events の admin 詳細 read boundary (M14): public.get_admin_event(target_event_id)
--
-- 対象: public.get_admin_event() の作成とEXECUTE ACLのみ。
--   get_admin_events()（M13の一覧）、events のRLS policy・列単位のSELECT権限・
--   trigger、他のfunction・table・default privilegeは変更しない。
--
-- 役割: /admin/events の詳細・編集画面用に、adminがevent 1件をtrustedな境界で読む。
--   M12でbase tableからは公開8列しか読めないため、内部列（created_by / created_at /
--   updated_at / first_published_at）と全status（draft・一度も公開されていない
--   cancelled を含む）の取得は本RPCで行う。一覧は get_admin_events()（別RPC）。
--
-- 認可: 関数の最初に public.is_admin()（active adminのみ）を評価し、falseなら
--   EVENT_MANAGEMENT_NOT_AUTHORIZED（M13と同じ契約）。target_event_idを使うqueryより先。
--   一般ユーザー・suspended/bannedのadmin・profile不在・auth.uid()がNULLは拒否される。
--
-- 返却列（exactly 12列。eventsの全列と型が一致）: id / title / venue / event_date /
--   description / image_url / ticket_url / status / created_by / created_at /
--   updated_at / first_published_at。派生列・profilesとのjoin（作成者名等）は含めない。
--
-- 行の範囲: statusに関係なく対象eventを1件返す（idはPKなので最大1行）。公開のRLS条件
--   （M11）は複製しない。存在しないidおよびNULLは、エラーにせず0行（専用のvalidation
--   errorは設けない。不正なUUID文字列は型変換の段階でPostgreSQLが拒否する）。
--
-- 含めないもの: write、optimistic concurrency、admin_logsへの記録（readは記録しない）。
-- SECURITY DEFINER（owner=postgres）/ STABLE / search_path=''。全参照はschema修飾。
--   dynamic SQLは使用しない。
-- ACL: PUBLIC / anon / service_role からEXECUTEを取り消し、authenticatedに付与する
--   （default privilegeに依存しない。M13と同じleast-privilege契約）。
-- 001〜029は変更しない。
-- =============================================================================

create function public.get_admin_event(
  target_event_id uuid
)
returns table (
  id uuid,
  title text,
  venue text,
  event_date timestamptz,
  description text,
  image_url text,
  ticket_url text,
  status text,
  created_by uuid,
  created_at timestamptz,
  updated_at timestamptz,
  first_published_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'EVENT_MANAGEMENT_NOT_AUTHORIZED';
  end if;

  return query
    select
      e.id,
      e.title,
      e.venue,
      e.event_date,
      e.description,
      e.image_url,
      e.ticket_url,
      e.status,
      e.created_by,
      e.created_at,
      e.updated_at,
      e.first_published_at
    from public.events as e
    where e.id = get_admin_event.target_event_id;
end;
$$;

revoke execute on function public.get_admin_event(uuid) from public;
revoke execute on function public.get_admin_event(uuid) from anon;
revoke execute on function public.get_admin_event(uuid) from service_role;
grant execute on function public.get_admin_event(uuid) to authenticated;
