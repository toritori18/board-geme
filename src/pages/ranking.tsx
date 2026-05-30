import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import games from "@/data/games.json";
import GameCard from "@/components/GameCard";
import type { Game } from "@/types/game";

type Tab = "search" | "ranking";

const allGames = games as Game[];
const sorted = [...allGames].sort((a, b) => b.rating - a.rating || b.votes - a.votes);
const allGenres = Array.from(new Set(allGames.flatMap((g) => g.tags)));

const PLAYER_OPTIONS = [
  { value: "1", label: "1人" },
  { value: "2", label: "2人" },
  { value: "3", label: "3人" },
  { value: "4", label: "4人" },
  { value: "5", label: "5人以上" },
];

const PLAY_TIME_OPTIONS = [
  { value: "30", label: "軽量級(～30分)" },
  { value: "60", label: "中量級(31〜60分)" },
  { value: "120", label: "重量級(61〜120分)" },
  { value: "121", label: "超重量級(120分以上)" },
];

const DIFFICULTY_OPTIONS = [
  { value: "初心者向け", label: "初心者向け" },
  { value: "中級者向け", label: "中級者向け" },
  { value: "上級者向け", label: "上級者向け" },
];

function parsePlayers(players: string): { min: number; max: number } {
  const parts = players.replace("人", "").split("〜");
  if (parts.length === 2) return { min: parseInt(parts[0]), max: parseInt(parts[1]) };
  const v = parseInt(parts[0]);
  return { min: v, max: v };
}

function parsePlayTime(playTime: string): { min: number; max: number } {
  const parts = playTime.replace("分", "").split("〜");
  if (parts.length === 2) return { min: parseInt(parts[0]), max: parseInt(parts[1]) };
  const v = parseInt(parts[0]);
  return { min: v, max: v };
}

export default function RankingPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>("search");

  // 検索条件
  const [query, setQuery] = useState("");
  const [playerFilter, setPlayerFilter] = useState("");
  const [playTimeFilter, setPlayTimeFilter] = useState("");
  const [difficultyFilter, setDifficultyFilter] = useState("");
  const [genreFilter, setGenreFilter] = useState("");

  // 検索結果（ボタンを押すまで null）
  const [results, setResults] = useState<Game[] | null>(null);

  const handleSearch = () => {
    const filtered = allGames.filter((game) => {
      // テキスト検索
      if (query.trim()) {
        const q = query.trim();
        const hit =
          game.name.includes(q) ||
          game.nameEn.toLowerCase().includes(q.toLowerCase()) ||
          game.shortDescription.includes(q) ||
          game.tags.some((t) => t.includes(q));
        if (!hit) return false;
      }

      // プレイ人数
      if (playerFilter) {
        const { min, max } = parsePlayers(game.players);
        const count = parseInt(playerFilter);
        if (count === 5) {
          if (max < 5) return false;
        } else {
          if (min > count || max < count) return false;
        }
      }

      // 所要時間
      if (playTimeFilter) {
        const { min, max } = parsePlayTime(game.playTime);
        if (playTimeFilter === "30" && max > 30) return false;
        if (playTimeFilter === "60" && (max < 31 || min > 60)) return false;
        if (playTimeFilter === "120" && (max < 61 || min > 120)) return false;
        if (playTimeFilter === "121" && max < 120) return false;
      }

      // 難易度
      if (difficultyFilter && game.difficulty !== difficultyFilter) return false;

      // ジャンル
      if (genreFilter && !game.tags.includes(genreFilter)) return false;

      return true;
    });

    setResults(filtered);
  };

  const handleReset = () => {
    setQuery("");
    setPlayerFilter("");
    setPlayTimeFilter("");
    setDifficultyFilter("");
    setGenreFilter("");
    setResults(null);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-purple-50">
      <header className="bg-white shadow-sm sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center justify-between">
          <button
            onClick={() => { setActiveTab("search"); handleReset(); }}
            className="flex items-center gap-2 hover:opacity-80 transition"
          >
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
            </div>
            <span className="font-bold text-gray-900 text-sm">ボードゲームランキング</span>
          </button>
          <button
            onClick={() => router.push("/")}
            className="text-sm text-gray-500 hover:text-indigo-600 transition"
          >
            ログアウト
          </button>
        </div>

        {/* タブ */}
        <div className="max-w-2xl mx-auto px-4">
          <div className="flex border-b border-gray-200">
            {(["search", "ranking"] as Tab[]).map((tab) => {
              const label = tab === "search" ? "検索" : "ランキング";
              return (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === tab
                      ? "border-indigo-600 text-indigo-600"
                      : "border-transparent text-gray-500 hover:text-gray-700"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-8">
        {activeTab === "search" && (
          <div>
            <div className="mb-6">
              <h1 className="text-2xl font-bold text-gray-900">ゲームを検索</h1>
              <p className="text-sm text-gray-500 mt-1">条件を選んで検索ボタンを押してください</p>
            </div>

            {/* 検索フォーム */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 mb-6 space-y-4">
              {/* キーワード */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">
                  キーワード
                </label>
                <div className="relative">
                  <svg
                    className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z" />
                  </svg>
                  <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                    placeholder="ゲーム名・タグで検索..."
                    className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition"
                  />
                </div>
              </div>

              {/* フィルター 2列グリッド */}
              <div className="grid grid-cols-2 gap-3">
                {/* プレイ人数 */}
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">
                    プレイ人数
                  </label>
                  <select
                    value={playerFilter}
                    onChange={(e) => setPlayerFilter(e.target.value)}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition bg-white"
                  >
                    <option value="">すべて</option>
                    {PLAYER_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>

                {/* 所要時間 */}
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">
                    所要時間
                  </label>
                  <select
                    value={playTimeFilter}
                    onChange={(e) => setPlayTimeFilter(e.target.value)}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition bg-white"
                  >
                    <option value="">すべて</option>
                    {PLAY_TIME_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>

                {/* 難易度 */}
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">
                    難易度
                  </label>
                  <select
                    value={difficultyFilter}
                    onChange={(e) => setDifficultyFilter(e.target.value)}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition bg-white"
                  >
                    <option value="">すべて</option>
                    {DIFFICULTY_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>

                {/* ジャンル */}
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">
                    ジャンル
                  </label>
                  <select
                    value={genreFilter}
                    onChange={(e) => setGenreFilter(e.target.value)}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition bg-white"
                  >
                    <option value="">すべて</option>
                    {allGenres.map((genre) => (
                      <option key={genre} value={genre}>{genre}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* ボタン */}
              <div className="flex gap-2 pt-1">
                <button
                  onClick={handleSearch}
                  className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2.5 rounded-lg transition text-sm"
                >
                  検索
                </button>
                <button
                  onClick={handleReset}
                  className="px-4 py-2.5 border border-gray-200 text-gray-500 hover:text-gray-700 hover:border-gray-300 rounded-lg transition text-sm"
                >
                  リセット
                </button>
              </div>
            </div>

            {/* 検索結果 */}
            {results !== null && (
              <div>
                <p className="text-sm text-gray-500 mb-3">
                  {results.length > 0
                    ? `${results.length}件のゲームが見つかりました`
                    : "条件に一致するゲームが見つかりませんでした"}
                </p>
                {results.length > 0 && (
                  <div className="space-y-3">
                    {results.map((game, index) => (
                      <GameCard key={game.id} game={game} rank={index + 1} />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {activeTab === "ranking" && (
          <div>
            <div className="mb-6">
              <h1 className="text-2xl font-bold text-gray-900">人気ランキング</h1>
              <p className="text-sm text-gray-500 mt-1">評価数・スコアをもとに集計</p>
            </div>

            <div className="space-y-3">
              {sorted.map((game, index) => (
                <GameCard key={game.id} game={game} rank={index + 1} />
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
