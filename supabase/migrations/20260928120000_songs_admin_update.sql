-- =============================================================================
-- 20260928120000_songs_admin_update.sql
-- songs のadmin内容更新 (S6): public.update_song()
--
-- 対象: public.update_song() の作成とEXECUTE ACLのみ。internal.normalize_song_content() /
--   public.create_song()（S5）、songs のtable・列・制約・index・trigger・RLS・policy・ACL、
--   admin_logs、public / admin の読み取りRPC（S2〜S4b）、他のfunction・table・default
--   privilegeは変更しない。songsのbase tableは引き続きクライアントから全拒否
--   （更新はこのSECURITY DEFINER RPC経由のみ）。status変更・DELETE・Storageは追加しない。
--
-- update_song(target_song_id, expected_updated_at, title, release_date, cover_image_url,
--             description) -> boolean
--   - 変更できるのは title / release_date / cover_image_url / description の4項目のみの
--     全置換（release_date・cover_image_url・description は NULL・blankでクリアできる）。
--     status・id・created_at は変更せず、updated_at は既存trigger（songs_set_updated_at）が更新する
--     （RPCから直接SETしない）。公開中（public）の曲を編集してもstatusは変わらない。
--   - 戻り値: 実際に変更した場合は true、有効な要求だが変更がない場合（no-op）は false。
--     存在しない・version不一致等はfalseではなくエラー。
--   - 検証の順序:
--       1. public.is_admin()（active adminのみ）でなければ SONG_MANAGEMENT_NOT_AUTHORIZED
--       2. expected_updated_at がNULLなら INVALID_SONG_VERSION
--       3. internal.normalize_song_content()（S5と同じ正規化・検証。title -> description ->
--          cover_image_url -> release_date の順）
--       4. 対象を SELECT ... FOR UPDATE でlock（target_song_id がNULLの場合も0行になる）
--       5. 存在しなければ SONG_NOT_FOUND（draft・publicのどちらも対象）
--       6. 現在の updated_at と expected_updated_at の完全一致（date_trunc・丸め・許容幅なし）。
--          不一致は SONG_VERSION_CONFLICT（内容がno-opでも、versionが古ければconflict）
--       7. 正規化後の4項目が全て現在値と同一（NULL同士は同一）ならno-op:
--          UPDATEせず updated_at も変えず admin_logs も書かず false を返す
--       8. UPDATE、admin_logs へ1行（action='update_song'、target_type='song'、
--          target_id=対象のid、detail={"changed_fields":[実際に変更された項目名]}。順序は
--          title, release_date, cover_image_url, description で固定。値は記録しない）
--       9. true を返す
--   - UPDATEとaudit INSERTは同一transactionで、audit失敗時はUPDATEもrollbackされる。
--   - 同時実行: 対象行のFOR UPDATEで直列化し、lock取得後の最新のupdated_atと比較するため、
--     同じversionで同時に更新しても一方だけが成功し、他方は SONG_VERSION_CONFLICT になる。
--   - owner=postgres・SECURITY DEFINER・VOLATILE・search_path=''、EXECUTEはauthenticatedと
--     postgresのみ（PUBLIC・anon・service_roleは不可）。dynamic SQLは使用しない。
-- 001〜043は変更しない。
-- =============================================================================

create function public.update_song(
  target_song_id uuid,
  expected_updated_at timestamptz,
  title text,
  release_date date default null,
  cover_image_url text default null,
  description text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin_id uuid := auth.uid();
  v_norm record;
  v_cur public.songs%rowtype;
  v_changed text[] := array[]::text[];
begin
  if not public.is_admin() then
    raise exception 'SONG_MANAGEMENT_NOT_AUTHORIZED';
  end if;

  if update_song.expected_updated_at is null then
    raise exception 'INVALID_SONG_VERSION';
  end if;

  select *
    into v_norm
    from internal.normalize_song_content(
      update_song.title,
      update_song.description,
      update_song.cover_image_url,
      update_song.release_date
    );

  select s.*
    into v_cur
    from public.songs as s
    where s.id = update_song.target_song_id
    for update;

  if not found then
    raise exception 'SONG_NOT_FOUND';
  end if;

  if v_cur.updated_at is distinct from update_song.expected_updated_at then
    raise exception 'SONG_VERSION_CONFLICT';
  end if;

  if v_cur.title is distinct from v_norm.title then
    v_changed := array_append(v_changed, 'title');
  end if;
  if v_cur.release_date is distinct from v_norm.release_date then
    v_changed := array_append(v_changed, 'release_date');
  end if;
  if v_cur.cover_image_url is distinct from v_norm.cover_image_url then
    v_changed := array_append(v_changed, 'cover_image_url');
  end if;
  if v_cur.description is distinct from v_norm.description then
    v_changed := array_append(v_changed, 'description');
  end if;

  if cardinality(v_changed) = 0 then
    return false;
  end if;

  update public.songs
    set title = v_norm.title,
        release_date = v_norm.release_date,
        cover_image_url = v_norm.cover_image_url,
        description = v_norm.description
    where id = update_song.target_song_id;

  insert into public.admin_logs (admin_id, action, target_type, target_id, detail)
  values (
    v_admin_id,
    'update_song',
    'song',
    update_song.target_song_id,
    jsonb_build_object('changed_fields', to_jsonb(v_changed))
  );

  return true;
end;
$$;

alter function public.update_song(uuid, timestamptz, text, date, text, text) owner to postgres;

revoke execute on function public.update_song(uuid, timestamptz, text, date, text, text) from public;
revoke execute on function public.update_song(uuid, timestamptz, text, date, text, text) from anon;
revoke execute on function public.update_song(uuid, timestamptz, text, date, text, text) from service_role;
grant execute on function public.update_song(uuid, timestamptz, text, date, text, text) to authenticated;
