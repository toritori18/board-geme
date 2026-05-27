import Link from "next/link";
import games from "@/data/games.json";
import GameCard from "@/components/GameCard";
import type { Game } from "@/types/game";

const sorted = [...(games as Game[])].sort((a, b) => b.rating - a.rating || b.votes - a.votes);

export default function RankingPage() {
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
          <button className="text-sm text-gray-500 hover:text-indigo-600 transition">
            ログアウト
          </button>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">人気ランキング</h1>
          <p className="text-sm text-gray-500 mt-1">評価数・スコアをもとに集計</p>
        </div>

        <div className="space-y-3">
          {sorted.map((game, index) => (
            <GameCard key={game.id} game={game} rank={index + 1} />
          ))}
        </div>
      </main>
    </div>
  );
}
