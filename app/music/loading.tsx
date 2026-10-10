export default function MusicListLoading() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="text-2xl font-bold">楽曲一覧</h1>
      <p className="mt-4 text-gray-500" aria-live="polite">
        読み込み中...
      </p>
    </main>
  );
}
