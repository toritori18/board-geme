import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import type { GetServerSideProps } from "next";
import GameCard from "@/components/GameCard";
import type { Game } from "@/types/game";
import { fetchGames } from "@/utils/game-mapper";

type Tab = "search" | "ranking";

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

function applyFilters(
  games: Game[],
  players: string,
  time: string,
  difficulty: string,
  genre: string
): Game[] {
  return games.filter((game) => {
    if (players) {
      const { min, max } = parsePlayers(game.players);
      const count = parseInt(players);
      if (count === 5) { if (max < 5) return false; }
      else { if (min > count || max < count) return false; }
    }
    if (time) {
      const { min, max } = parsePlayTime(game.playTime);
      if (time === "30" && max > 30) return false;
      if (time === "60" && (max < 31 || min > 60)) return false;
      if (time === "120" && (max < 61 || min > 120)) return false;
      if (time === "121" && max < 120) return false;
    }
    if (difficulty && game.difficulty !== difficulty) return false;
    if (genre && !game.tags.includes(genre)) return false;
    return true;
  });
}

function applySearchFilters(
  games: Game[],
  q: string,
  players: string,
  time: string,
  difficulty: string,
  genre: string
): Game[] {
  const base = applyFilters(games, players, time, difficulty, genre);
  if (!q.trim()) return base;
  const lq = q.trim().toLowerCase();
  return base.filter(
    (game) =>
      game.name.includes(q.trim()) ||
      game.nameEn.toLowerCase().includes(lq) ||
      game.shortDescription.includes(q.trim()) ||
      game.tags.some((t) => t.includes(q.trim()))
  );
}

const STORAGE_KEY = "rankingFilters";

type SavedFilters = {
  query: string;
  playerFilter: string;
  playTimeFilter: string;
  difficultyFilter: string;
  genreFilter: string;
  rankPlayerFilter: string;
  rankPlayTimeFilter: string;
  rankDifficultyFilter: string;
  rankGenreFilter: string;
};

type Props = {
  allGames: Game[];
  initialTab: Tab;
};

export const getServerSideProps: GetServerSideProps<Props> = async ({ query }) => {
  const allGames = await fetchGames();
  return {
    props: {
      allGames,
      initialTab: query.tab === "ranking" ? "ranking" : "search",
    },
  };
};

export default function RankingPage({ allGames, initialTab }: Props) {
  const router = useRouter();

  const sorted = [...allGames].sort((a, b) => b.rating - a.rating || b.votes - a.votes);
  const allGenres = Array.from(new Set(allGames.flatMap((g) => g.tags)));

  const [activeTab, setActiveTab] = useState<Tab>(initialTab);

  // 検索フィルター
  const [query, setQuery] = useState("");
  const [playerFilter, setPlayerFilter] = useState("");
  const [playTimeFilter, setPlayTimeFilter] = useState("");
  const [difficultyFilter, setDifficultyFilter] = useState("");
  const [genreFilter, setGenreFilter] = useState("");
  const [results, setResults] = useState<Game[] | null>(null);

  // ランキングフィルター
  const [rankPlayerFilter, setRankPlayerFilter] = useState("");
  const [rankPlayTimeFilter, setRankPlayTimeFilter] = useState("");
  const [rankDifficultyFilter, setRankDifficultyFilter] = useState("");
  const [rankGenreFilter, setRankGenreFilter] = useState("");

  // sessionStorageからフィルター状態を復元（詳細画面から戻ったとき用）
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY);
      if (!saved) return;
      const state: SavedFilters = JSON.parse(saved);
      setQuery(state.query ?? "");
      setPlayerFilter(state.playerFilter ?? "");
      setPlayTimeFilter(state.playTimeFilter ?? "");
      setDifficultyFilter(state.difficultyFilter ?? "");
      setGenreFilter(state.genreFilter ?? "");
      setRankPlayerFilter(state.rankPlayerFilter ?? "");
      setRankPlayTimeFilter(state.rankPlayTimeFilter ?? "");
      setRankDifficultyFilter(state.rankDifficultyFilter ?? "");
      setRankGenreFilter(state.rankGenreFilter ?? "");
    } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // フィルター状態をsessionStorageに保存
  useEffect(() => {
    const state: SavedFilters = {
      query, playerFilter, playTimeFilter, difficultyFilter, genreFilter,
      rankPlayerFilter, rankPlayTimeFilter, rankDifficultyFilter, rankGenreFilter,
    };
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [query, playerFilter, playTimeFilter, difficultyFilter, genreFilter,
      rankPlayerFilter, rankPlayTimeFilter, rankDifficultyFilter, rankGenreFilter]);

  // タブのみURLに同期（共有・ブックマーク対応）
  const handleTabChange = (tab: Tab) => {
    setActiveTab(tab);
    void router.replace({ pathname: "/ranking", query: { tab } }, undefined, { shallow: true });
  };

  const handleSearch = () => {
    setResults(applySearchFilters(allGames, query, playerFilter, playTimeFilter, difficultyFilter, genreFilter));
  };

  const handleReset = () => {
    setQuery("");
    setPlayerFilter("");
    setPlayTimeFilter("");
    setDifficultyFilter("");
    setGenreFilter("");
    setResults(null);
  };

  const filteredRanking = applyFilters(sorted, rankPlayerFilter, rankPlayTimeFilter, rankDifficultyFilter, rankGenreFilter);
  const isRankingFiltered = rankPlayerFilter || rankPlayTimeFilter || rankDifficultyFilter || rankGenreFilter;

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-purple-50">
      <header className="bg-white shadow-sm sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center justify-between">
          <button
            onClick={() => { handleTabChange("search"); handleReset(); }}
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
                  onClick={() => handleTabChange(tab)}
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

            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 mb-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">キーワード</label>
                <div className="relative">
                  <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none"
                    fill="none" stroke="currentColor" viewBox="0 0 24 24">
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

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">プレイ人数</label>
                  <select value={playerFilter} onChange={(e) => setPlayerFilter(e.target.value)}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition bg-white">
                    <option value="">すべて</option>
                    {PLAYER_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">所要時間</label>
                  <select value={playTimeFilter} onChange={(e) => setPlayTimeFilter(e.target.value)}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition bg-white">
                    <option value="">すべて</option>
                    {PLAY_TIME_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">難易度</label>
                  <select value={difficultyFilter} onChange={(e) => setDifficultyFilter(e.target.value)}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition bg-white">
                    <option value="">すべて</option>
                    {DIFFICULTY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">ジャンル</label>
                  <select value={genreFilter} onChange={(e) => setGenreFilter(e.target.value)}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition bg-white">
                    <option value="">すべて</option>
                    {allGenres.map((genre) => <option key={genre} value={genre}>{genre}</option>)}
                  </select>
                </div>
              </div>

              <div className="flex gap-2 pt-1">
                <button onClick={handleSearch}
                  className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2.5 rounded-lg transition text-sm">
                  検索
                </button>
                <button onClick={handleReset}
                  className="px-4 py-2.5 border border-gray-200 text-gray-500 hover:text-gray-700 hover:border-gray-300 rounded-lg transition text-sm">
                  リセット
                </button>
              </div>
            </div>

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
                      <GameCard key={game.id} game={game} rank={index + 1} showVotes={false} />
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

            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mb-6">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">プレイ人数</label>
                  <select value={rankPlayerFilter} onChange={(e) => setRankPlayerFilter(e.target.value)}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition bg-white">
                    <option value="">すべて</option>
                    {PLAYER_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">所要時間</label>
                  <select value={rankPlayTimeFilter} onChange={(e) => setRankPlayTimeFilter(e.target.value)}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition bg-white">
                    <option value="">すべて</option>
                    {PLAY_TIME_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">難易度</label>
                  <select value={rankDifficultyFilter} onChange={(e) => setRankDifficultyFilter(e.target.value)}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition bg-white">
                    <option value="">すべて</option>
                    {DIFFICULTY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">ジャンル</label>
                  <select value={rankGenreFilter} onChange={(e) => setRankGenreFilter(e.target.value)}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition bg-white">
                    <option value="">すべて</option>
                    {allGenres.map((genre) => <option key={genre} value={genre}>{genre}</option>)}
                  </select>
                </div>
              </div>
              {isRankingFiltered && (
                <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
                  <p className="text-sm text-gray-500">{filteredRanking.length}件</p>
                  <button
                    onClick={() => { setRankPlayerFilter(""); setRankPlayTimeFilter(""); setRankDifficultyFilter(""); setRankGenreFilter(""); }}
                    className="text-xs text-indigo-600 hover:underline"
                  >
                    リセット
                  </button>
                </div>
              )}
            </div>

            <div className="space-y-3">
              {filteredRanking.map((game, index) => (
                <GameCard key={game.id} game={game} rank={index + 1} />
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
