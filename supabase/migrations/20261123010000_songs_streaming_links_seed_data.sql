-- =============================================================================
-- 20261123010000_songs_streaming_links_seed_data.sql
-- 既存8曲の配信サービスリンクを投入する（PM依頼 2026-11-23、ユーザー確認済み）
--
-- 20261123000000_songs_streaming_links.sql で追加した4列
-- （spotify_url / apple_music_url / youtube_music_url / line_music_url）
-- に、Claudeがウェブ検索で各プラットフォームの実ページを直接開いて
-- release_dateの完全一致まで確認した上で確定したURLを投入する
-- （ユーザーに提示し、承認を得た32件）。
--
-- public.update_song()（全置換RPC）を経由せず、該当4列のみを対象に
-- id指定のUPDATEを直接行う。理由:
--   - 対象列はtextでCHECK制約を持たない（形式検証はinternal.normalize_song_content()
--     内のみ。本migrationで投入する値は既にhttps://で始まる形式であることを
--     人手・エージェント双方で確認済み）
--   - title/description/release_date/cover_image_url等、他列には一切触れない
--     （update_songの「全置換」契約をこのUPDATEに持ち込まない）
--   - songs_set_updated_at トリガー（20260920022832_core_schema.sql）により
--     updated_atは自動更新される
--
-- 対象のidは、本番の get_public_songs() を直接呼び出して得た実際の値
-- （曲名の文字列一致ではなく、確認済みのUUIDで一意に指定）。
-- =============================================================================

update public.songs set
  spotify_url = 'https://open.spotify.com/track/0EHVlX8m94Nbkjp4q3aW7i',
  apple_music_url = 'https://music.apple.com/jp/song/6806933500',
  youtube_music_url = 'https://music.youtube.com/watch?v=HfIByzndRpY',
  line_music_url = 'https://music.line.me/webapp/track/mt0000000027570b98'
where id = '437735e2-e081-474f-b2bb-5d8d44a65f77'; -- 恋慕

update public.songs set
  spotify_url = 'https://open.spotify.com/track/7K1EcWcvg9kcrIUcK5yx8f',
  apple_music_url = 'https://music.apple.com/jp/song/terminal/1873715110',
  youtube_music_url = 'https://music.youtube.com/watch?v=lADVXAHebTE',
  line_music_url = 'https://music.line.me/webapp/track/mt0000000024b276c3'
where id = '62bd85a3-2969-4fa1-adf3-215ed55c285a'; -- Terminal

update public.songs set
  spotify_url = 'https://open.spotify.com/track/1JjlTvz35gmdCD8fvIznH8',
  apple_music_url = 'https://music.apple.com/jp/song/1821354313',
  youtube_music_url = 'https://music.youtube.com/watch?v=hVJ7uGnKTGw',
  line_music_url = 'https://music.line.me/webapp/track/mt0000000022d5e73c'
where id = 'c5c9e897-a621-4354-ac75-c1aede5fa31f'; -- 黒い心臓

update public.songs set
  spotify_url = 'https://open.spotify.com/track/30UozDzsPsqSl4ISvEj05V',
  apple_music_url = 'https://music.apple.com/jp/song/re-road/1816677447',
  youtube_music_url = 'https://music.youtube.com/watch?v=F6rq5LFH6_c',
  line_music_url = 'https://music.line.me/webapp/track/mt0000000022961c58'
where id = '6bcf18b0-6d8f-4718-b544-a9e7500703d0'; -- re:Road.

update public.songs set
  spotify_url = 'https://open.spotify.com/track/1DRFCD9donihsf8NbEcI5o',
  apple_music_url = 'https://music.apple.com/jp/song/hello-tokyo/1787267251',
  youtube_music_url = 'https://music.youtube.com/watch?v=dyF_yafIQY8',
  line_music_url = 'https://music.line.me/webapp/track/mt0000000020e4a8fb'
where id = '5a3c3a97-ac47-46bc-98fe-fdb1d0966457'; -- HELLO,TOKYO

update public.songs set
  spotify_url = 'https://open.spotify.com/track/5doH1D8V3JAWUdrNp3wXGB',
  apple_music_url = 'https://music.apple.com/jp/song/1605901301',
  youtube_music_url = 'https://music.youtube.com/watch?v=QzHi4NsX6vc',
  line_music_url = 'https://music.line.me/webapp/track/mt0000000015863105'
where id = 'c6a7058a-b4aa-40e9-887c-616421e67551'; -- 二人の世界

update public.songs set
  spotify_url = 'https://open.spotify.com/track/7FG8TqvPbfHpvztVWFJ9qO',
  apple_music_url = 'https://music.apple.com/jp/song/1536518269',
  youtube_music_url = 'https://music.youtube.com/watch?v=p2CxJu5jnP4',
  line_music_url = 'https://music.line.me/webapp/track/mt0000000011ff6d31'
where id = 'ec88cef8-fcae-4903-b3d8-59734995788e'; -- ベイビーパラダイス

update public.songs set
  spotify_url = 'https://open.spotify.com/track/3VYC42OJsiLhyYtr5g4Hng',
  apple_music_url = 'https://music.apple.com/jp/song/its-a-new-world/1508475918',
  youtube_music_url = 'https://music.youtube.com/watch?v=tOGnn6KafUY',
  line_music_url = 'https://music.line.me/webapp/track/mt0000000010e31d4e'
where id = 'd721fcbe-476c-4162-911b-6645965fb58d'; -- It's A New World
