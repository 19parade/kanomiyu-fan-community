-- =============================================================================
-- 20261108000000_news_content_nullable.sql
-- WHAT'S NEW機能（2026-11-08付PM依頼）: public.news.content を nullable に変更
--
-- 背景: PROJECT_SPEC.md 6.9 時点の news.content は NOT NULL（本文必須）
--   だったが、今回のPM依頼で「本文なし・リンクのみ」パターン（パターンB）が
--   新たに要件として追加された。本文・リンクURLが両方空欄の記事（タイトルと
--   日付のみ表示）も許容するため、content は常に本文ありきの前提を外す
--   必要最小限の変更としてNOT NULL制約のみを外す（他の列・制約・index・
--   trigger・RLS・ACLは一切変更しない）。
--
-- 対象に含まれないもの: news テーブルの他の列・既存の2つのCHECK制約
--   （news_status_check / news_published_requires_published_at_check）、
--   他のtable・function・RLS・ACL。
-- =============================================================================

alter table public.news
  alter column content drop not null;
