-- =============================================================================
-- 20260921060119_events_lifecycle_schema_prep.sql
-- RLS最終実装計画 13節「1. schema preparation」migration
--
-- 対象（本migrationに含まれるもの）:
--   A. events.status CHECK制約の置き換え（upcoming/ended/cancelled -> draft/public/cancelled）
--   B. event_participants.status CHECK制約の置き換え（going/interested/cancelled -> going/attended/cancelled）
--   C. reports.target_type CHECK制約の置き換え（post/comment/user -> profile/post/comment）
--   D. events.first_published_at の追加と、そのDB invariant（trigger + CHECK）
--   E. internal schema の新設（後続のauthorization helper配置用。今回helper自体は作らない）
--
-- 本migrationに含まれないもの（後続migrationで対応）:
--   - is_blocked_between() 等のhelper本体
--   - public_profiles
--   - record_policy_consent() / admin role・status RPC / post・comment RPC /
--     reports RPC / event participant RPC / like RPC
--   - RLS policy・ENABLE ROW LEVEL SECURITY
--   - table GRANT/REVOKEの再設計（events.first_published_at列の権限を含む、
--     「adminだけDELETE可能」等の認可判断はすべてRLS migrationへ残す）
--   - rate limit trigger
--   - tests / Storage policy / Next.jsコード
--
-- 20260920022832_core_schema.sql（001）・20260920052609_authorization_helpers.sql（002）・
-- 20260920054819_fix_authorization_helper_acl.sql（003）・
-- 20260920120721_signup_db_foundation.sql（004）はいずれも変更しない。
--
-- -----------------------------------------------------------------------------
-- 実装前に読み取り専用で確認した事実（推測でCHECK制約名をDROPしていない）:
--   - events_status_check:            CHECK (status = ANY (ARRAY['upcoming','ended','cancelled']))
--   - event_participants_status_check: CHECK (status = ANY (ARRAY['going','interested','cancelled']))
--   - reports_target_type_check:      CHECK (target_type = ANY (ARRAY['post','comment','user']))
--   - events.status のDEFAULTは 'upcoming'（新CHECKでは許可されない値になるため、
--     本migrationでDEFAULTも 'draft' へ変更する）。
--   - events には既存の BEFORE UPDATE トリガー events_set_updated_at
--     （public.set_updated_at() を呼び出し、updated_at のみを書き換える）が存在する。
--     本migrationで追加する新トリガーは updated_at に一切触れないため、
--     実行順序（トリガー名のアルファベット順）に関わらず競合しない。
--   - public.set_updated_at() は SECURITY DEFINER ではない通常のplpgsql関数であり、
--     本migrationでは変更しない。
--   - internal schema はremoteに現時点で存在しない（新設して問題ない）。
--   - events / event_participants / reports はいずれも0行（前回調査時点から変更なし
--     という前提でCHECK制約の置き換えを行う。既存データ破壊のリスクはない）。
-- -----------------------------------------------------------------------------


-- -----------------------------------------------------------------------------
-- A. events.status CHECK制約の置き換え
--
-- 新しいライフサイクル: draft -> public -> cancelled。
-- 「開催済みかどうか」はstatusでは管理せず、event_dateと現在時刻の比較で判断する
-- （upcoming/endedという時間軸由来の状態は廃止）。
-- 新規行のDEFAULTも 'upcoming' から 'draft' に変更する（新しいライフサイクルの
-- 起点はdraftであるため）。
-- -----------------------------------------------------------------------------
alter table public.events
  drop constraint events_status_check;

alter table public.events
  add constraint events_status_check
  check (status in ('draft', 'public', 'cancelled'));

alter table public.events
  alter column status set default 'draft';


-- -----------------------------------------------------------------------------
-- B. event_participants.status CHECK制約の置き換え
--
-- going/attended/cancelled の3値に確定。interested は廃止する。
-- DEFAULT値 'going' は新しい値集合にもそのまま含まれるため変更不要。
-- （visibility列のCHECK制約・許容値 public/private/attended は今回変更しない。
-- statusのattendedとvisibilityのattendedは別概念であり、既存のvisibility CHECKは
-- そのまま維持する。）
-- -----------------------------------------------------------------------------
alter table public.event_participants
  drop constraint event_participants_status_check;

alter table public.event_participants
  add constraint event_participants_status_check
  check (status in ('going', 'attended', 'cancelled'));


-- -----------------------------------------------------------------------------
-- C. reports.target_type CHECK制約の置き換え
--
-- profile/post/comment の3値に確定。user は廃止する。
-- -----------------------------------------------------------------------------
alter table public.reports
  drop constraint reports_target_type_check;

alter table public.reports
  add constraint reports_target_type_check
  check (target_type in ('profile', 'post', 'comment'));


-- -----------------------------------------------------------------------------
-- D. events.first_published_at の追加とDB invariant
--
-- 仕様:
--   - 新規eventは必ず status='draft' としてのみ作成できる（INSERT時点で
--     status='public'・'cancelled'を直接指定することは許可しない）。
--   - never-published draft では first_published_at は NULL。
--   - 初回 draft -> public 遷移（UPDATE経由のみ。上記の通りINSERT時点で
--     いきなりpublicとして作成する経路は存在しない）時にDBが now() を自動設定する。
--   - client/adminから直接値を指定・変更させない（クライアントが送った値は
--     常に無視し、trigger側で計算した値のみを採用する）。
--   - 一度非NULLになったら変更不可（NULLへ戻すことを含む）。ただし、UPDATE payload
--     に既存値と同じ first_published_at が含まれているだけの場合はエラーにせず、
--     実際に異なる値へ変更しようとした場合のみ拒否する（IS DISTINCT FROM判定）。
--   - 一度publicを経たevent（cancelledへ遷移した後も含む）はdraftへ戻せない。
--
-- 権限（誰がUPDATE/DELETEできるか）はRLS/GRANT migrationで扱うため、
-- 本migrationでは列単位のREVOKE等は行わない。ここで保証するのはユーザー権限と
-- 独立したDB invariantのみである。
-- -----------------------------------------------------------------------------
alter table public.events
  add column first_published_at timestamptz;

-- draft状態の行がfirst_published_atを持つことを静的に禁止する（trigger実装の
-- 誤りに対する多重防御。INSERT/UPDATEいずれの経路でも、statusがdraftのままなら
-- first_published_atは必ずNULLでなければならない）。
alter table public.events
  add constraint events_draft_requires_no_first_published_at_check
  check (status <> 'draft' or first_published_at is null);

create function public.guard_events_publish_state()
returns trigger
language plpgsql
as $$
begin
  if TG_OP = 'INSERT' then
    -- 新規eventは必ずdraftとしてのみ作成できる。draft以外を直接指定した
    -- INSERTは拒否する（public/cancelledへはdraftからのUPDATEでのみ遷移する）。
    if new.status <> 'draft' then
      raise exception 'EVENTS_MUST_BE_CREATED_AS_DRAFT';
    end if;
    -- draft作成時、clientがfirst_published_atへ何を渡してきても無視しNULLに固定する
    -- （events_draft_requires_no_first_published_at_check とも整合する）。
    new.first_published_at := null;
    return new;
  end if;

  -- TG_OP = 'UPDATE'

  -- 一度publicを経たevent（cancelled経由を含む）はdraftへ戻せない。
  if old.first_published_at is not null and new.status = 'draft' then
    raise exception 'EVENTS_CANNOT_REVERT_TO_DRAFT';
  end if;

  if old.first_published_at is not null then
    -- 既に設定済みのfirst_published_atは不変。UPDATE payloadに既存値と同じ
    -- 値が含まれているだけなら許容し（IS DISTINCT FROMはfalseになりエラーに
    -- ならない）、既存値から実際に異なる値へ変更しようとした場合のみ拒否する。
    if new.first_published_at is distinct from old.first_published_at then
      raise exception 'EVENTS_FIRST_PUBLISHED_AT_IMMUTABLE';
    end if;
  else
    -- 未設定の場合、draft -> public への初回遷移でのみnow()を設定する。
    -- それ以外（draftのまま、既にpublicから他状態への遷移等）ではclientの
    -- 入力値に関わらず常にNULLを維持する。
    if old.status <> 'public' and new.status = 'public' then
      new.first_published_at := now();
    else
      new.first_published_at := null;
    end if;
  end if;

  return new;
end;
$$;

create trigger events_guard_publish_state
  before insert or update on public.events
  for each row execute function public.guard_events_publish_state();


-- -----------------------------------------------------------------------------
-- E. internal schema の新設
--
-- 後続のauthorization helper（is_blocked_between()等）を、PostgRESTのExposed
-- schemasに含まれないschemaへ配置するための器として新設する。今回はschemaの
-- 作成のみを行い、helper自体・GRANT/REVOKEの詳細設計は次フェーズで行う。
--
-- 新設したschemaはデフォルトでは所有者（本migrationを実行するロール）以外に
-- 何の権限も持たないが、明示性を優先し、PUBLICへのUSAGE/CREATEを持たないことを
-- 保証するため明示的にREVOKEしておく（既存ACLが無くても冪等に成功する）。
-- anon/authenticatedへのGRANTは一切行わない（今回はhelperが存在しないため
-- 付与する対象がない）。
-- -----------------------------------------------------------------------------
create schema internal;

revoke create on schema internal from public;
revoke usage on schema internal from public;
-- =============================================================================
