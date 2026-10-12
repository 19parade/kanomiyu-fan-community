-- =============================================================================
-- 20261012100000_posts_comments_content_length_check.sql
-- F5-C1 migration A: posts.content / comments.content の文字数・形式CHECK制約
--
-- 対象（本migrationに含まれるもの）:
--   - public.posts に posts_content_length_check を追加
--   - public.comments に comments_content_length_check を追加
--
-- 本migrationに含まれないもの:
--   - RPC・RLS policy・GRANT/REVOKEの変更（いずれも行わない）
--   - posts/commentsの他の列・index・triggerの変更
--   - 既存48件のmigrationの変更
--
-- 仕様（PM確定、F5-B/F5-C1指示）:
--   posts.content   : 1〜2,000コードポイント
--   comments.content: 1〜500コードポイント
--   共通: 前後の半角スペース(U+0020)・全角スペース(U+3000)禁止、
--         ASCII制御文字・DELのうちLF(U+000A)以外禁止（chr(1)-chr(9) ∪
--         chr(11)-chr(31) ∪ chr(127)）。
--   文字数カウントは PostgreSQL の char_length()（コードポイント単位）を使用する。
--   既存の supabase/migrations/20261012090000_profiles_bio_length_check.sql
--   （profiles_bio_check）と全く同一の禁止文字集合・比較方式を踏襲する
--   （新しい正規表現パターンを独自に考案しない）。
--
-- profiles.bio との違い:
--   bio は nullable（NULL許容、CHECKは「NULL OR (条件)」の形）だが、
--   posts.content / comments.content はどちらも既存スキーマ上 NOT NULL
--   （supabase/migrations/20260920022832_core_schema.sql で確定済み、本
--   migrationでは列定義・NULL制約を一切変更しない）。したがって本制約は
--   「NULL OR」分岐を持たず、常に1〜上限文字数の範囲チェックを行う
--   （空文字列・空白のみの投稿はこの範囲チェックとtrim禁止条件の両方で
--   拒否される）。
--
-- 既存データへの影響（検証プロジェクトで読み取り専用確認済み。F5-B・
-- F5-C1いずれの時点でも posts / comments は0件）:
--   select count(*) from public.posts;    -- 0
--   select count(*) from public.comments; -- 0
--   したがって本制約を追加しても、既存行のCHECK違反によるmigration失敗の
--   リスクはない（違反件数0件）。
--
-- アプリ側正規化との整合性（将来のNext.js実装フェーズへの申し送り）:
--   lib/profile/bio.ts の normalizeBio() と同一方針（CRLF/CR→LF統一、
--   TAB→半角スペース、前後の半角・全角スペースをtrim）を、posts/comments
--   の投稿フォームでも適用することを前提とする。本migrationはDB側の
--   最終防衛線のみを追加し、アプリ側の正規化関数の追加は本migrationの
--   範囲外（F5の実装フェーズで対応）。
--
-- 本migrationは静的SQLレビューのみを行っており、検証プロジェクトへの
-- BEGIN/ROLLBACKを伴うDDL probeは実施していない（F5-C1指示により今回は
-- 禁止されているため）。db pushによる適用もまだ行っていない。
-- 20260920022832〜20261012090000（既存48件）はいずれも変更しない。
-- =============================================================================

alter table public.posts
  add constraint posts_content_length_check
  check (
    char_length(content) >= 1
    and char_length(content) <= 2000
    and left(content, 1) <> chr(32)
    and right(content, 1) <> chr(32)
    and left(content, 1) <> chr(12288)
    and right(content, 1) <> chr(12288)
    and content !~ (
      '[' || chr(1) || '-' || chr(9) ||
      chr(11) || '-' || chr(31) ||
      chr(127) || ']'
    )
  );

alter table public.comments
  add constraint comments_content_length_check
  check (
    char_length(content) >= 1
    and char_length(content) <= 500
    and left(content, 1) <> chr(32)
    and right(content, 1) <> chr(32)
    and left(content, 1) <> chr(12288)
    and right(content, 1) <> chr(12288)
    and content !~ (
      '[' || chr(1) || '-' || chr(9) ||
      chr(11) || '-' || chr(31) ||
      chr(127) || ']'
    )
  );
-- =============================================================================
