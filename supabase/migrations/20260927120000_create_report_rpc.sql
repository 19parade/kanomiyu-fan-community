-- =============================================================================
-- 20260927120000_create_report_rpc.sql
-- 通報作成RPC (M4): public.create_report(target_type, target_id, reason, detail)
--
-- 対象: public.create_report() の作成とEXECUTE ACLのみ。
--   reports のtable ACL / RLS / policy / trigger / CHECK、他のRPC・helperは変更しない。
--
-- 仕様（PROJECT_SPEC.md 6.7・v1.19 + PM確定事項）:
--   - reporter は必ず auth.uid()。呼び出し側から reporter_id / status /
--     handled_by / handled_at / created_at / updated_at は指定できない。
--   - 最初に「auth.uid() IS NOT NULL かつ is_active_user()」を検証し、失敗は
--     REPORT_NOT_AUTHORIZED（対象の存否確認より先）。
--   - target_type / reason は完全一致のみ（trim/lower等の自動補正なし）。
--   - detail: 両端の空白類（U+0020 / tab / LF / CR / U+3000）を除去し、
--     除去後に空ならNULL。内部の空白・改行は保持。正規化後 2000文字超は
--     REPORT_DETAIL_TOO_LONG。常に正規化後の値をINSERTする。
--   - target は SECURITY DEFINER でRLSをbypassするため、既存のfan-facing
--     visibility を関数内で明示的に再現する。
--       post   : status='published' かつ viewer→author のblockなし
--       comment: comment/親postがともにpublished、viewer→post author および
--                viewer→comment author のblockなし
--       profile: status IN ('active','suspended') かつ
--                internal.is_blocked_with()（双方向block）でない
--     reverse-onlyのblock（author→viewer）はpost/commentの通報を妨げない。
--   - 利用不可の対象（不存在 / hidden / deleted / banned / block）は全て同一の
--     REPORT_TARGET_NOT_AVAILABLE とし、存在有無を漏らさない。自己通報は
--     利用可能な対象に対してのみ SELF_REPORT_NOT_ALLOWED
--     （profileはUUID比較のみで判定できるためtarget照会より前に判定）。
--   - 重複は UNIQUE(reporter_id, target_type, target_id) を最終保証とし、
--     当該制約のunique_violationのみを REPORT_ALREADY_EXISTS へ変換する。
--   - レート制限はM2のBEFORE INSERT triggerに任せる（RPC内で独自countしない）。
--     triggerはUNIQUE制約より先に走るため、5件/10分に達している状態での
--     重複通報は REPORT_ALREADY_EXISTS ではなく REPORT_RATE_LIMITED になる
--     （rate-limit防御を優先する仕様）。
--   - 戻り値は作成された reports.id (uuid) のみ。
--
-- 引数名は公開signatureとして target_type / target_id / reason / detail を維持し、
-- function body内では関数名で修飾して（create_report.xxx）列名との曖昧さを避ける。
--
-- ACL: PUBLIC / anon からEXECUTEを取り消し、authenticatedに付与する。
--   service_role は publicスキーマのdefault privilegeにより自動付与される
--   （既存RPCと同じ既知の挙動）。
-- 001〜019は変更しない。
-- =============================================================================

create function public.create_report(
  target_type text,
  target_id uuid,
  reason text,
  detail text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reporter_id uuid := auth.uid();
  v_detail text;
  v_target_author_id uuid;
  v_found boolean;
  v_report_id uuid;
  v_constraint text;
begin
  if v_reporter_id is null or not public.is_active_user() then
    raise exception 'REPORT_NOT_AUTHORIZED';
  end if;

  if create_report.target_type is null
     or create_report.target_type not in ('profile', 'post', 'comment') then
    raise exception 'INVALID_REPORT_TARGET_TYPE';
  end if;

  if create_report.reason is null
     or create_report.reason not in (
       'defamation', 'threats', 'discrimination', 'harassment',
       'personal_info_exposure', 'impersonation', 'fraud', 'ticket_scalping',
       'illegal_activity', 'unauthorized_repost', 'copyright_infringement',
       'full_lyrics_posting', 'unauthorized_media_posting', 'spam',
       'dating_solicitation', 'other'
     ) then
    raise exception 'INVALID_REPORT_REASON';
  end if;

  -- 両端の空白類（U+0020, tab, LF, CR, U+3000）を除去。内部は保持。
  v_detail := nullif(
    btrim(create_report.detail, chr(32) || chr(9) || chr(10) || chr(13) || chr(12288)),
    ''
  );

  if v_detail is not null and char_length(v_detail) > 2000 then
    raise exception 'REPORT_DETAIL_TOO_LONG';
  end if;

  if create_report.target_id is null then
    raise exception 'REPORT_TARGET_NOT_AVAILABLE';
  end if;

  if create_report.target_type = 'post' then
    select p.author_id
      into v_target_author_id
      from public.posts p
      where p.id = create_report.target_id
        and p.status = 'published'
        and not exists (
          select 1
          from public.blocks b
          where b.blocker_id = v_reporter_id
            and b.blocked_id = p.author_id
        );
    v_found := found;

    if not v_found then
      raise exception 'REPORT_TARGET_NOT_AVAILABLE';
    end if;
    if v_target_author_id = v_reporter_id then
      raise exception 'SELF_REPORT_NOT_ALLOWED';
    end if;

  elsif create_report.target_type = 'comment' then
    select c.author_id
      into v_target_author_id
      from public.comments c
      join public.posts p on p.id = c.post_id
      where c.id = create_report.target_id
        and c.status = 'published'
        and p.status = 'published'
        and not exists (
          select 1
          from public.blocks b
          where b.blocker_id = v_reporter_id
            and b.blocked_id = p.author_id
        )
        and not exists (
          select 1
          from public.blocks b
          where b.blocker_id = v_reporter_id
            and b.blocked_id = c.author_id
        );
    v_found := found;

    if not v_found then
      raise exception 'REPORT_TARGET_NOT_AVAILABLE';
    end if;
    if v_target_author_id = v_reporter_id then
      raise exception 'SELF_REPORT_NOT_ALLOWED';
    end if;

  else
    if create_report.target_id = v_reporter_id then
      raise exception 'SELF_REPORT_NOT_ALLOWED';
    end if;

    select exists (
      select 1
      from public.profiles pr
      where pr.id = create_report.target_id
        and pr.status in ('active', 'suspended')
        and not internal.is_blocked_with(pr.id)
    ) into v_found;

    if not v_found then
      raise exception 'REPORT_TARGET_NOT_AVAILABLE';
    end if;
  end if;

  begin
    insert into public.reports (reporter_id, target_type, target_id, reason, detail)
    values (
      v_reporter_id,
      create_report.target_type,
      create_report.target_id,
      create_report.reason,
      v_detail
    )
    returning id into v_report_id;
  exception
    when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint = 'reports_reporter_target_key' then
        raise exception 'REPORT_ALREADY_EXISTS';
      end if;
      raise;
  end;

  return v_report_id;
end;
$$;

revoke execute on function public.create_report(text, uuid, text, text) from public;
revoke execute on function public.create_report(text, uuid, text, text) from anon;
grant execute on function public.create_report(text, uuid, text, text) to authenticated;
