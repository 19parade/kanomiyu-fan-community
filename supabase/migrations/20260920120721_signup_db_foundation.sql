-- =============================================================================
-- 20260920120721_signup_db_foundation.sql
-- Supabase signup DB基盤
--
-- 対象（本migrationに含まれるもの）:
--   1. profiles.username        への追加CHECK制約
--   2. profiles.display_name    への追加CHECK制約
--   3. app_settings.current_terms_version           への追加CHECK制約
--   4. app_settings.current_privacy_policy_version   への追加CHECK制約
--   5. public.handle_new_user() トリガー関数
--   6. handle_new_user() のEXECUTE権限設定
--   7. auth.users への on_auth_user_created トリガー（AFTER INSERT）
--
-- 本migrationに含まれないもの（対象外）:
--   - /signup UI・クライアント側のsignUp()呼び出し
--   - クライアント側バリデーション
--   - DBエラーの日本語メッセージへの変換
--   - username availability確認用API
--   - 実Authユーザーを用いたE2Eテスト
--   - RLS有効化・RLSポリシー
--   - record_policy_consent() 等の再同意RPC
--
-- 20260920022832_core_schema.sql（001）・20260920052609_authorization_helpers.sql（002）・
-- 20260920054819_fix_authorization_helper_acl.sql（003）はいずれも変更しない。
--
-- -----------------------------------------------------------------------------
-- 実装前に確認し、報告済みの事項:
--
-- (a) profiles.username の既存CHECK制約との関係
--     001に既存の profiles_username_format_check
--       CHECK (username ~ '^[a-z0-9_-]{3,20}$')
--     は、ハイフンを許可し、先頭underscoreも禁止していない。
--     本migrationで要求されている新しいusername正規表現
--       ^[a-z0-9][a-z0-9_]{2,19}$
--     は、ハイフンを禁止し、先頭は英小文字/数字のみを要求する、より厳格な規則。
--     001は変更禁止のため、新しい正規表現は別名の追加CHECK制約として
--     ALTER TABLEで付与する。結果としてprofiles.usernameには新旧2本の
--     CHECK制約が同時に存在することになるが、新制約は旧制約の許可集合の
--     部分集合であり（新制約を満たす値は必ず旧制約も満たす）、両者が
--     同時に成立不可能になるような矛盾はない。実質的な許可文字集合は
--     新制約（狭い方）で決まる。
--
-- (b) 制御文字・空白文字の表現方法
--     本migrationのCHECK制約・関数本体では、制御文字（U+0001からU+001F・
--     U+007F）および空白文字（TAB・LF・VT・FF・CR・U+0020・U+3000）を
--     判定する箇所がある。これらをSQLソースファイル中に生のバイト値として
--     直接埋め込むと、レビュー性・Git管理・各種ツールとの互換性の観点で
--     問題があるため、すべて chr() 関数呼び出しと文字列連結（||）によって
--     実行時に構築する。ファイル自体には印字可能なASCII文字のみが含まれる。
--     U+0000（NULバイト）については、PostgreSQLのtext型がNULバイトを
--     値として保持できない（変換・格納時点でエラーになる）ため、
--     CHECK制約・関数本体のいずれでも明示的な判定を行わない。
-- -----------------------------------------------------------------------------


-- -----------------------------------------------------------------------------
-- 1. profiles.username への追加CHECK制約
--
-- 3〜20文字、半角英小文字・数字・アンダースコアのみ、先頭はアンダースコア不可。
-- 大文字・日本語・ハイフン・スペースは不可。正規表現自体に制御文字・空白文字の
-- 明示は不要なため、通常のリテラルで記述する。
--
-- 予約usernameとの完全一致も、本CHECK制約で保証する（trigger経由以外の
-- 書き込み経路からも予約usernameを保存できないようにする）。trigger側の
-- 予約語判定（handle_new_user()のSIGNUP_RESERVED_USERNAME）は事前拒否として
-- 引き続き行い、本CHECK制約はDBレベルの最終防衛線として機能する二重構造とする。
-- -----------------------------------------------------------------------------
alter table public.profiles
  add constraint profiles_username_signup_format_check
  check (
    username ~ '^[a-z0-9][a-z0-9_]{2,19}$'
    and username not in (
      'admin', 'administrator', 'moderator', 'mod', 'official',
      'staff', 'support', 'system', 'root', 'kanomiyu', 'kano_miyu'
    )
  );


-- -----------------------------------------------------------------------------
-- 2. profiles.display_name への追加CHECK制約
--
-- 文字数（char_length）1〜30。先頭・末尾にU+0020（半角スペース）を含まない。
-- 先頭・末尾にU+3000（全角スペース）を含まない。U+0001〜U+001Fの制御文字を
-- 含まない。U+007Fを含まない（U+0000は上記(b)の通り判定不要）。
-- 内部の空白（半角・全角とも）は許可する。
-- -----------------------------------------------------------------------------
alter table public.profiles
  add constraint profiles_display_name_signup_check
  check (
    char_length(display_name) between 1 and 30
    and left(display_name, 1) <> chr(32)
    and right(display_name, 1) <> chr(32)
    and left(display_name, 1) <> chr(12288)
    and right(display_name, 1) <> chr(12288)
    and display_name !~ ('[' || chr(1) || '-' || chr(31) || chr(127) || ']')
  );


-- -----------------------------------------------------------------------------
-- 3. app_settings.current_terms_version への追加CHECK制約
-- 4. app_settings.current_privacy_policy_version への追加CHECK制約
--
-- 1文字以上。先頭・末尾にASCII whitespace（TAB・LF・VT・FF・CR・半角スペース）
-- を含まない。先頭・末尾にU+3000（全角スペース）を含まない。内部の空白は許可。
-- 自動trimは行わない（CHECKは格納値をそのまま判定する）。x.y形式のような
-- 固定フォーマットへの制約は課さない。
-- -----------------------------------------------------------------------------
alter table public.app_settings
  add constraint app_settings_current_terms_version_format_check
  check (
    char_length(current_terms_version) >= 1
    and left(current_terms_version, 1) not in (
      chr(9), chr(10), chr(11), chr(12), chr(13), chr(32), chr(12288)
    )
    and right(current_terms_version, 1) not in (
      chr(9), chr(10), chr(11), chr(12), chr(13), chr(32), chr(12288)
    )
  );

alter table public.app_settings
  add constraint app_settings_current_privacy_policy_version_format_check
  check (
    char_length(current_privacy_policy_version) >= 1
    and left(current_privacy_policy_version, 1) not in (
      chr(9), chr(10), chr(11), chr(12), chr(13), chr(32), chr(12288)
    )
    and right(current_privacy_policy_version, 1) not in (
      chr(9), chr(10), chr(11), chr(12), chr(13), chr(32), chr(12288)
    )
  );


-- -----------------------------------------------------------------------------
-- 5. public.handle_new_user()
--
-- auth.users への AFTER INSERT トリガーから呼び出され、対応する profiles
-- レコードを自動作成する。raw_user_meta_data のうち信頼するキーは
-- username・display_name・policy_consent の3つのみ。role・status・
-- terms_version・privacy_policy_version等のメタデータは一切信用しない。
--
-- SECURITY DEFINER・search_path=''固定とし、参照オブジェクトはすべて
-- schema-qualifiedで記述する。既存関数（is_admin()等）と同じ方針。
-- OWNERの変更は行わない。既存の同名関数が万一存在する場合に黙って
-- 上書きしないよう、CREATE OR REPLACEではなくCREATE FUNCTIONを用いる。
-- -----------------------------------------------------------------------------
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_meta jsonb := new.raw_user_meta_data;
  v_policy_consent jsonb;
  v_username_raw text;
  v_username text;
  v_display_name_raw text;
  v_display_name text;
  v_terms_version text;
  v_privacy_policy_version text;
  v_consent_at timestamptz;
begin
  -- (1) raw_user_meta_data はJSONオブジェクトであること
  if jsonb_typeof(v_meta) is distinct from 'object' then
    raise exception 'SIGNUP_INVALID_METADATA';
  end if;

  -- (2) policy_consent はJSON真偽値trueであること（型変換なし）
  v_policy_consent := v_meta -> 'policy_consent';
  if jsonb_typeof(v_policy_consent) is distinct from 'boolean'
     or v_policy_consent <> 'true'::jsonb then
    raise exception 'SIGNUP_POLICY_CONSENT_REQUIRED';
  end if;

  -- (3) username はJSON文字列であること
  if jsonb_typeof(v_meta -> 'username') is distinct from 'string' then
    raise exception 'SIGNUP_INVALID_USERNAME';
  end if;
  v_username_raw := v_meta ->> 'username';

  -- (4) 前後の半角スペース（U+0020）のみtrim
  v_username := btrim(v_username_raw, chr(32));

  -- (5) username形式チェック
  if v_username !~ '^[a-z0-9][a-z0-9_]{2,19}$' then
    raise exception 'SIGNUP_INVALID_USERNAME';
  end if;

  -- (6) 予約済みusernameチェック（trim後の値との完全一致）
  if v_username in (
    'admin', 'administrator', 'moderator', 'mod', 'official',
    'staff', 'support', 'system', 'root', 'kanomiyu', 'kano_miyu'
  ) then
    raise exception 'SIGNUP_RESERVED_USERNAME';
  end if;

  -- (7) display_name はJSON文字列であること
  if jsonb_typeof(v_meta -> 'display_name') is distinct from 'string' then
    raise exception 'SIGNUP_INVALID_DISPLAY_NAME';
  end if;
  v_display_name_raw := v_meta ->> 'display_name';

  -- (8) 前後の半角スペース（U+0020）・全角スペース（U+3000）をtrim
  v_display_name := btrim(v_display_name_raw, chr(32) || chr(12288));

  -- (9) display_name の文字数・前後スペース・制御文字チェック
  --     （テーブルのprofiles_display_name_signup_checkと同一のルールを、
  --     trim後の値に対して事前に確認する。CHECK制約自体は最終防衛線として
  --     引き続き有効。）
  if char_length(v_display_name) < 1 or char_length(v_display_name) > 30 then
    raise exception 'SIGNUP_INVALID_DISPLAY_NAME';
  end if;
  if left(v_display_name, 1) = chr(32) or right(v_display_name, 1) = chr(32) then
    raise exception 'SIGNUP_INVALID_DISPLAY_NAME';
  end if;
  if left(v_display_name, 1) = chr(12288) or right(v_display_name, 1) = chr(12288) then
    raise exception 'SIGNUP_INVALID_DISPLAY_NAME';
  end if;
  if v_display_name ~ ('[' || chr(1) || '-' || chr(31) || chr(127) || ']') then
    raise exception 'SIGNUP_INVALID_DISPLAY_NAME';
  end if;

  -- (10) app_settings（id=1）から現行バージョンを取得（fail closed）。
  --      app_settings_current_terms_version_format_check /
  --      app_settings_current_privacy_policy_version_format_check と同一の
  --      ルール（1文字以上・前後ASCII whitespace禁止・前後U+3000禁止）を
  --      取得値に対しても確認する。trimによる救済は行わない。
  select current_terms_version, current_privacy_policy_version
    into v_terms_version, v_privacy_policy_version
    from public.app_settings
    where id = 1;

  if v_terms_version is null or v_privacy_policy_version is null then
    raise exception 'SIGNUP_POLICY_CONFIG_ERROR';
  end if;

  if char_length(v_terms_version) < 1
     or left(v_terms_version, 1) in (
       chr(9), chr(10), chr(11), chr(12), chr(13), chr(32), chr(12288)
     )
     or right(v_terms_version, 1) in (
       chr(9), chr(10), chr(11), chr(12), chr(13), chr(32), chr(12288)
     )
  then
    raise exception 'SIGNUP_POLICY_CONFIG_ERROR';
  end if;

  if char_length(v_privacy_policy_version) < 1
     or left(v_privacy_policy_version, 1) in (
       chr(9), chr(10), chr(11), chr(12), chr(13), chr(32), chr(12288)
     )
     or right(v_privacy_policy_version, 1) in (
       chr(9), chr(10), chr(11), chr(12), chr(13), chr(32), chr(12288)
     )
  then
    raise exception 'SIGNUP_POLICY_CONFIG_ERROR';
  end if;

  -- (11) terms_agreed_at / privacy_policy_agreed_at 用に now() を一度だけ取得
  v_consent_at := now();

  -- (12) profiles へ単一のINSERT（重複チェックのSELECTは行わず、
  --      profiles_username_key のUNIQUE制約のみが重複判定の最終権威）
  insert into public.profiles (
    id,
    username,
    display_name,
    role,
    status,
    fan_since,
    avatar_url,
    bio,
    terms_version,
    terms_agreed_at,
    privacy_policy_version,
    privacy_policy_agreed_at
  ) values (
    new.id,
    v_username,
    v_display_name,
    'member',
    'active',
    null,
    null,
    null,
    v_terms_version,
    v_consent_at,
    v_privacy_policy_version,
    v_consent_at
  );

  -- (13)
  return new;
end;
$$;


-- -----------------------------------------------------------------------------
-- 6. handle_new_user() のEXECUTE権限設定
--
-- Supabaseのdefault privilegesにより、publicスキーマ新規関数は作成時点で
-- anon/authenticated/service_role/postgresへEXECUTEが自動付与される
-- （002適用時に確認済みの既知の挙動）。トリガー経由の自動呼び出しは
-- EXECUTE権限の有無に左右されないため、直接呼び出し経路を塞ぐ目的で
-- public/anon/authenticatedからは明示的にREVOKEする。service_roleからは
-- 今回REVOKEしない。ALTER DEFAULT PRIVILEGESは変更しない。
-- -----------------------------------------------------------------------------
revoke execute on function public.handle_new_user() from public;
revoke execute on function public.handle_new_user() from anon;
revoke execute on function public.handle_new_user() from authenticated;


-- -----------------------------------------------------------------------------
-- 7. on_auth_user_created トリガー
--
-- auth.users への行INSERT後にhandle_new_user()を呼び出す。既存の同名
-- トリガーが万一存在する場合に黙って置き換えないよう、DROP+再作成ではなく
-- 単純なCREATE TRIGGERを用いる。
-- -----------------------------------------------------------------------------
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();
-- =============================================================================
