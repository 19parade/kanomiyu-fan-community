-- =============================================================================
-- 20260921061635_block_authorization_helper.sql
-- Authorization Helpersフェーズ（1本目） - block判定用internal helper
--
-- 対象（本migrationに含まれるもの）:
--   - internal.is_blocked_with(uuid) 関数の作成
--   - 上記関数・internal schemaに関する必要最小限のACL設定
--
-- 本migrationに含まれないもの（後続migrationで対応）:
--   - public_profiles
--   - profiles / blocks / posts / comments / likes / event_participants
--     その他13テーブルのRLS policy・ENABLE ROW LEVEL SECURITY
--   - RPC群（record_policy_consent() 等）
--   - rate limit / Storage / Next.jsコード
--
-- 20260920022832_core_schema.sql（001）・20260920052609_authorization_helpers.sql（002）・
-- 20260920054819_fix_authorization_helper_acl.sql（003）・
-- 20260920120721_signup_db_foundation.sql（004）・
-- 20260921060119_events_lifecycle_schema_prep.sql（005）はいずれも変更しない。
-- 既存の internal schema（005で新設済み）を再作成しない。
--
-- -----------------------------------------------------------------------------
-- 実装前に読み取り専用で確認した事実:
--   - internal schemaは既に存在し、ACLは {postgres=UC/postgres} のみ
--     （PUBLIC/anon/authenticatedのUSAGE/CREATEなし）。005から無変更。
--   - pg_default_acl を確認した結果、Supabaseのdefault privilege
--     （postgres/supabase_admin所有）は public/storage/extensions/graphql/
--     graphql_public/realtime/auth の各schemaに個別スコープされており、
--     schema無指定（グローバル）のエントリは存在しない。internal schemaは
--     このリストに含まれないため、internal schema内に新規作成する関数は
--     anon/authenticated/service_role等への自動EXECUTE付与を一切受けない
--     （002適用時にpublicスキーマで発生した「デフォルトで広くGRANTされる」
--     問題は、internal schemaでは発生しない）。
--   - public.blocks は現時点でRLS無効（relrowsecurity=false）・
--     anon/authenticated/service_role/postgresへの直接GRANTも変更されて
--     いない（既存の広いGRANTのまま）。本migrationはblocksのRLS/GRANTを
--     一切変更しない。
-- -----------------------------------------------------------------------------


-- -----------------------------------------------------------------------------
-- internal.is_blocked_with(target_user_id uuid) returns boolean
--
-- 呼び出し元自身（auth.uid()）と target_user_id の間に、どちらの向きであれ
-- blockが存在するかを判定する。viewerを引数に取らず、常に呼び出し元自身
-- （auth.uid()）を基準にすることで、任意の第三者同士のblock関係を問い合わせる
-- oracleになる余地を構造的に排除している（2引数方式は不採用）。
--
-- 本関数は今後、posts/comments RLSのvisibility判定・public_profiles・likes・
-- event participant visibility・interaction validation等、DB側の実際の
-- 認可・可視性判定（RLSのUSING句／WITH CHECK句等）から利用される予定である。
-- 単なる表示上の装飾的filterではなく、DB側の認可判定の構成要素として扱うこと。
--
-- 挙動:
--   - auth.uid() が NULL（未認証）の場合は false。
--     この挙動が安全である前提は、以下3つの別レイヤーのsecurity boundaryが
--     同時に成立していることに依存する。
--       (1) anonロールにはこの関数のEXECUTE権限自体を与えない（本migration
--           で明示的にREVOKEする）。
--       (2) anon向けの読み取り経路・RLS policyでは、そもそもblock
--           filtering自体を行わない設計とする（anonには「ブロック」という
--           概念自体を適用しないため）。
--       (3) この関数はauthenticatedロールとして評価されるpolicy/RPCから
--           のみ利用する。
--     将来、上記いずれかの前提（特に(1)(2)）を変更する場合──例えば
--     anonにもblock相当の可視性制御を適用する、あるいはこの関数を
--     anonから呼び出せるようにする等──は、このfail-open（false）という
--     挙動が安全である根拠自体が失われるため、その変更に着手する前に
--     本関数の設計を再レビューすること。
--   - target_user_id が NULL の場合は false。
--   - target_user_id が auth.uid() 自身（自己判定）の場合は false。
--   - viewer→target のblock行が存在すれば true。
--   - target→viewer のblock行が存在すれば true（この方向は、将来blocksへ
--     「本人がblockerの行のみSELECT可」というRLSを適用した場合、通常の
--     SECURITY INVOKER評価では呼び出し元から見えなくなる方向であり、
--     この関数がSECURITY DEFINERである主目的はこの非対称性を正しく
--     判定するためである）。
--   - 双方向にblockが存在する場合も true。
--
-- SECURITY DEFINER・search_path=''固定とし、参照オブジェクト（public.blocks・
-- auth.uid()）はすべてschema-qualifiedで記述する。is_admin()/is_active_user()
-- と同じ方針。owner権限によるRLS bypassの範囲は、本関数内で参照する
-- public.blocksの読み取りのみに限定される（他のテーブル・書き込み操作は
-- 一切行わない）。LEAKPROOF・STRICTは指定しない。OWNERの変更も行わない。
-- -----------------------------------------------------------------------------
create function internal.is_blocked_with(target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    auth.uid() is not null
    and target_user_id is not null
    and target_user_id <> auth.uid()
    and exists (
      select 1
      from public.blocks
      where (blocks.blocker_id = auth.uid() and blocks.blocked_id = target_user_id)
         or (blocks.blocker_id = target_user_id and blocks.blocked_id = auth.uid())
    );
$$;

-- PUBLIC/anonへは一切のUSAGE/EXECUTEを与えない。anon向け公開コンテンツでは
-- block filtering自体を行わない方針のため、anonがこの関数を呼び出す必要は
-- ない。internal schema作成時点でPUBLICへのUSAGE/CREATEは既に無いが、
-- 明示性のため関数のEXECUTE権限についても念のため明示的にREVOKEしておく
-- （冪等。既存ACLが無くても失敗しない）。
revoke execute on function internal.is_blocked_with(uuid) from public;
revoke execute on function internal.is_blocked_with(uuid) from anon;

-- authenticated ロールがRLS policy等からこの関数を呼び出せるよう、
-- internal schemaへのUSAGEと、この関数へのEXECUTEのみを付与する
-- （CREATE等の他の権限は与えない）。
grant usage on schema internal to authenticated;
grant execute on function internal.is_blocked_with(uuid) to authenticated;
-- service_role/postgresへの権限は変更しない（internal schemaにはSupabaseの
-- default privilegeが及ばないため、そもそも自動付与されていない。今回も
-- 明示的なGRANT/REVOKEは行わない）。
-- =============================================================================
