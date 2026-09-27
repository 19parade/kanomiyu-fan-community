-- =============================================================================
-- 20260928130000_songs_admin_status.sql
-- songs のadmin公開状態の変更 (S7): public.set_song_status()
--
-- 対象: public.set_song_status() の作成とEXECUTE ACLのみ。songs のtable・列・制約
--   （songs_status_check）・index・trigger・RLS・policy・ACL、internal.normalize_song_content()、
--   create_song() / update_song()（S5・S6）、public / admin の読み取りRPC（S2〜S4b）、
--   admin_logs、他のfunction・table・default privilegeは変更しない。songsのbase tableは
--   引き続きクライアントから全拒否（status変更はこのSECURITY DEFINER RPC経由のみ）。
--   内容の編集・DELETE・Storageは追加しない。新しいhelperも作らない。
--
-- set_song_status(target_song_id, expected_updated_at, target_status) -> boolean
--   - 変更するのは status のみ（title / release_date / cover_image_url / description /
--     created_at は変更せず、updated_at は既存trigger（songs_set_updated_at）が更新する。
--     RPCから直接SETしない）。
--   - 許可する遷移: draft -> public（公開）と public -> draft（非公開へ戻す）の両方向。
--     release_date（NULL・過去・今日・未来）や内容の充足（cover・descriptionの有無）は
--     公開の条件にしない。同じstatusへの要求はno-op。
--   - 戻り値: 実際にstatusを変更した場合は true、同じstatusでのno-opは false。
--     存在しない・version不一致等はfalseではなくエラー。
--   - 検証の順序:
--       1. public.is_admin()（active adminのみ）でなければ SONG_MANAGEMENT_NOT_AUTHORIZED
--       2. expected_updated_at がNULLなら INVALID_SONG_VERSION
--       3. target_status が 'draft' / 'public' の完全一致でなければ（NULLを含む。trim・大文字小文字の
--          補正なし）INVALID_SONG_STATUS（一覧の INVALID_SONG_STATUS_FILTER とは別）
--       4. 対象を SELECT ... FOR UPDATE でlock（target_song_id がNULLの場合も0行になる）
--       5. 存在しなければ SONG_NOT_FOUND（draft・publicのどちらも対象）
--       6. 現在の updated_at と expected_updated_at の完全一致（date_trunc・丸め・許容幅なし）。
--          不一致は SONG_VERSION_CONFLICT（同じstatusのno-opでも、versionが古ければconflict）
--       7. 現在のstatusが target_status と同じならno-op:
--          UPDATEせず updated_at も変えず admin_logs も書かず false を返す
--       8. statusをUPDATEし、admin_logs へ1行（action='set_song_status'、target_type='song'、
--          target_id=対象のid、detail={"from_status":"...","to_status":"..."}。内容の値は記録しない）
--       9. true を返す
--   - UPDATEとaudit INSERTは同一transactionで、audit失敗時はstatusもrollbackされる。
--   - versionは update_song() と同じ updated_at で、内容の更新とstatusの変更は同じversionの
--     流れを共有する（どちらかで進んだ後は、古いtokenのもう一方の操作は conflict になる）。
--   - 同時実行: 対象行のFOR UPDATEで直列化し、lock取得後の最新の updated_at と比較する。
--   - owner=postgres・SECURITY DEFINER・VOLATILE・search_path=''、EXECUTEはauthenticatedと
--     postgresのみ（PUBLIC・anon・service_roleは不可）。dynamic SQLは使用しない。
-- 001〜044は変更しない。
-- =============================================================================

create function public.set_song_status(
  target_song_id uuid,
  expected_updated_at timestamptz,
  target_status text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin_id uuid := auth.uid();
  v_cur_status text;
  v_cur_updated_at timestamptz;
begin
  if not public.is_admin() then
    raise exception 'SONG_MANAGEMENT_NOT_AUTHORIZED';
  end if;

  if set_song_status.expected_updated_at is null then
    raise exception 'INVALID_SONG_VERSION';
  end if;

  if set_song_status.target_status is null
     or set_song_status.target_status not in ('draft', 'public') then
    raise exception 'INVALID_SONG_STATUS';
  end if;

  select s.status, s.updated_at
    into v_cur_status, v_cur_updated_at
    from public.songs as s
    where s.id = set_song_status.target_song_id
    for update;

  if not found then
    raise exception 'SONG_NOT_FOUND';
  end if;

  if v_cur_updated_at is distinct from set_song_status.expected_updated_at then
    raise exception 'SONG_VERSION_CONFLICT';
  end if;

  if v_cur_status = set_song_status.target_status then
    return false;
  end if;

  update public.songs
    set status = set_song_status.target_status
    where id = set_song_status.target_song_id;

  insert into public.admin_logs (admin_id, action, target_type, target_id, detail)
  values (
    v_admin_id,
    'set_song_status',
    'song',
    set_song_status.target_song_id,
    jsonb_build_object('from_status', v_cur_status, 'to_status', set_song_status.target_status)
  );

  return true;
end;
$$;

alter function public.set_song_status(uuid, timestamptz, text) owner to postgres;

revoke execute on function public.set_song_status(uuid, timestamptz, text) from public;
revoke execute on function public.set_song_status(uuid, timestamptz, text) from anon;
revoke execute on function public.set_song_status(uuid, timestamptz, text) from service_role;
grant execute on function public.set_song_status(uuid, timestamptz, text) to authenticated;
