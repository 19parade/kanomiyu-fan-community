-- =============================================================================
-- 20260928060000_songs_publication_state.sql
-- songs の公開状態 (S1): status 列（draft / public）とCHECK制約
--
-- 対象: public.songs への status 列とCHECK制約の追加のみ。RLS・policy・table/column ACL・
--   default privilege・index・trigger（songs_set_updated_at）・function・他のtableは変更しない。
--   public read・RPC・admin write・Storage・validation（title / cover_image_url / release_date
--   等）は追加しない。songsは引き続きクライアントから全拒否（deny-by-default）のままである。
--
-- status text NOT NULL DEFAULT 'draft'
--   - 値は 'draft' / 'public' の完全一致のみ（CHECK: songs_status_check）。
--   - 新しく作られた楽曲は、明示的に公開しない限り 'public' にならない。
--   - release_date とは独立（release_date が NULL・未来・過去のいずれでも draft / public に
--     できる。発売日と公開状態を結び付けるCHECKは作らない）。
--   - 状態の遷移（draft <-> public の両方向）はこのmigrationでは制限しない
--     （eventsの first_published_at のような公開履歴は持たない）。
--   - published_at / created_by は追加しない。'archived' は追加しない。
--   - 適用時点でsongsは0行（既存行のpublication stateを推測しない）。
-- 001〜037は変更しない。
-- =============================================================================

alter table public.songs
  add column status text not null default 'draft';

alter table public.songs
  add constraint songs_status_check
  check (status in ('draft', 'public'));
