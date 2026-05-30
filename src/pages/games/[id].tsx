import { useRouter } from "next/router";
import Link from "next/link";
import gamesData from "@/data/games.json";
import type { Game } from "@/types/game";

const games = gamesData as Game[];

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((star) => (
        <svg
          key={star}
          className={`w-5 h-5 ${star <= Math.round(rating) ? "text-yellow-400" : "text-gray-200"}`}
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      ))}
      <span className="text-xl font-bold text-gray-800 ml-1">{rating.toFixed(1)}</span>
    </div>
  );
}

export default function GameDetailPage() {
  const router = useRouter();
  const { id } = router.query;
  const game = games.find((g) => g.id === Number(id));

  if (!game) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-purple-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-500 text-lg">ゲームが見つかりませんでした</p>
          <Link href="/ranking" className="mt-4 inline-block text-indigo-600 hover:underline text-sm">
            ランキングに戻る
          </Link>
        </div>
      </div>
    );
  }

  const rank =
    [...games]
      .sort((a, b) => b.rating - a.rating || b.votes - a.votes)
      .findIndex((g) => g.id === game.id) + 1;

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-purple-50">
      <header className="bg-white shadow-sm sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/ranking" className="flex items-center gap-2 group">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
            </div>
            <span className="font-bold text-gray-900 text-sm group-hover:text-indigo-600 transition">
              ボードゲームランキング
            </span>
          </Link>
          <button
            onClick={() => router.push("/")}
            className="text-sm text-gray-500 hover:text-indigo-600 transition"
          >
            ログアウト
          </button>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-8">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="bg-gradient-to-r from-indigo-500 to-purple-600 h-44 flex items-center justify-center">
            <div className="text-center text-white">
              <p className="text-6xl font-black opacity-20">#{rank}</p>
              <p className="text-3xl font-bold -mt-4">{game.name}</p>
              <p className="text-sm opacity-70 mt-1">{game.nameEn}</p>
            </div>
          </div>

          <div className="p-6 space-y-6">
            <div>
              <StarRating rating={game.rating} />
              <p className="text-sm text-gray-400 mt-1">{game.votes.toLocaleString()}人が評価</p>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="bg-indigo-50 rounded-xl p-3 text-center">
                <p className="text-xs text-indigo-400 font-medium">プレイ人数</p>
                <p className="text-sm font-bold text-indigo-700 mt-1">{game.players}</p>
              </div>
              <div className="bg-purple-50 rounded-xl p-3 text-center">
                <p className="text-xs text-purple-400 font-medium">プレイ時間</p>
                <p className="text-sm font-bold text-purple-700 mt-1">{game.playTime}</p>
              </div>
              <div className="bg-pink-50 rounded-xl p-3 text-center">
                <p className="text-xs text-pink-400 font-medium">対象年齢</p>
                <p className="text-sm font-bold text-pink-700 mt-1">{game.minAge}歳〜</p>
              </div>
            </div>

            <div>
              <h2 className="text-sm font-semibold text-gray-700 mb-2">ゲーム紹介</h2>
              <p className="text-sm text-gray-600 leading-relaxed">{game.description}</p>
            </div>

            <div>
              <h2 className="text-sm font-semibold text-gray-700 mb-2">タグ</h2>
              <div className="flex gap-2 flex-wrap">
                {game.tags.map((tag) => (
                  <span
                    key={tag}
                    className="text-sm bg-indigo-50 text-indigo-600 px-3 py-1 rounded-full"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* 右下固定の戻るボタン */}
      <button
        onClick={() => router.back()}
        className="fixed bottom-6 right-6 flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-3 rounded-full shadow-lg transition"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        戻る
      </button>
    </div>
  );
}
