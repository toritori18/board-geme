import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import Head from "next/head";
import type { GetServerSideProps } from "next";
import GameCard from "@/components/GameCard";
import type { Game } from "@/types/game";
import { fetchGamesPage, fetchGenres } from "@/utils/game-mapper";
import type { GameFilters } from "@/utils/game-mapper";
import { getSessionUser } from "@/utils/session";
import { logout } from "@/utils/logout";

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
  { value: "121", label: "超重量級(120分超)" },
];

const DIFFICULTY_OPTIONS = [
  { value: "初心者向け", label: "初心者向け" },
  { value: "中級者向け", label: "中級者向け" },
  { value: "上級者向け", label: "上級者向け" },
];

const PAGE_SIZE = 20;

type Props = {
  tab: Tab;
  games: Game[];
  total: number;
  page: number;
  query: string;
  players: string;
  playTime: string;
  difficulty: string;
  genre: string;
  genres: string[];
  // 検索タブで「検索」ボタンが押された結果を表示すべきかどうか
  searched: boolean;
};

function getStringParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

export const getServerSideProps: GetServerSideProps<Props> = async ({ req, query }) => {
  if (!getSessionUser(req)) {
    return { redirect: { destination: "/", permanent: false } };
  }

  const tab: Tab = query.tab === "ranking" ? "ranking" : "search";
  const rawPage = Number(getStringParam(query.page));
  const page = Number.isFinite(rawPage) && rawPage >= 1 ? Math.floor(rawPage) : 1;
  const players = getStringParam(query.players);
  const playTime = getStringParam(query.time);
  const difficulty = getStringParam(query.difficulty);
  const genre = getStringParam(query.genre);
  const q = getStringParam(query.q);
  const searched = tab === "search" && getStringParam(query.searched) === "1";

  const genres = await fetchGenres();

  // 検索タブは「検索ボタンを押して初めて結果を出す」挙動のため、
  // 未検索の状態ではゲーム一覧を取得しない
  if (tab === "search" && !searched) {
    return {
      props: {
        tab,
        games: [],
        total: 0,
        page,
        query: q,
        players,
        playTime,
        difficulty,
        genre,
        genres,
        searched,
      },
    };
  }

  const filters: GameFilters = {
    players,
    playTime,
    difficulty,
    genre,
    query: tab === "search" ? q : undefined,
  };
  const { games, total } = await fetchGamesPage({ page, pageSize: PAGE_SIZE, filters });

  // ?page=99999 のような範囲外のページ番号を直接開かれると、fetchGamesPage() は
  // 「0件」を返す（PGRST103のフォールバック、game-mapper.ts参照）。total > 0（条件に
  // 一致する行自体は存在する）のに指定ページだけ空になるのは、URLと表示内容が
  // 食い違って利用者が混乱するため、実際に存在する最終ページへリダイレクトする。
  // total === 0（そもそも条件に一致するゲームが無い）のときはリダイレクトせず
  // 「0件」の表示に任せる（無限リダイレクトを避けるため）。
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (page > totalPages && total > 0) {
    const redirectParams =
      tab === "search"
        ? buildQuery({
            tab,
            page: String(totalPages),
            searched: "1",
            q,
            players,
            time: playTime,
            difficulty,
            genre,
          })
        : buildQuery({ tab, page: String(totalPages), players, time: playTime, difficulty, genre });
    const search = new URLSearchParams(redirectParams).toString();
    return {
      redirect: { destination: `/ranking?${search}`, permanent: false },
    };
  }

  return {
    props: { tab, games, total, page, query: q, players, playTime, difficulty, genre, genres, searched },
  };
};

// 空文字のキーはURLに含めない（見た目をきれいに保つため）
function buildQuery(params: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(params)) {
    if (value) result[key] = value;
  }
  return result;
}

export default function RankingPage({
  tab,
  games,
  total,
  page,
  query,
  players,
  playTime,
  difficulty,
  genre,
  genres,
  searched,
}: Props) {
  const router = useRouter();

  // 検索タブは「検索」ボタン押下時にのみURLへ反映するため、入力中はローカルstateで持つ
  const [localQuery, setLocalQuery] = useState(query);
  const [localPlayers, setLocalPlayers] = useState(players);
  const [localPlayTime, setLocalPlayTime] = useState(playTime);
  const [localDifficulty, setLocalDifficulty] = useState(difficulty);
  const [localGenre, setLocalGenre] = useState(genre);

  // ブラウザの戻る/進むでpropsが変わったとき（URLから状態が復元されたとき）に
  // 検索フォームの入力欄も追従させる
  useEffect(() => {
    setLocalQuery(query);
    setLocalPlayers(players);
    setLocalPlayTime(playTime);
    setLocalDifficulty(difficulty);
    setLocalGenre(genre);
  }, [query, players, playTime, difficulty, genre]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const isRankingFiltered = Boolean(players || playTime || difficulty || genre);

  // shallow: false（デフォルト）でgetServerSidePropsを再実行させ、DBから再取得する
  const pushQuery = (next: Record<string, string>) => {
    void router.push({ pathname: "/ranking", query: next });
  };

  const handleLogout = async () => {
    await logout();
    router.push("/");
  };

  const handleLogoClick = () => {
    setLocalQuery("");
    setLocalPlayers("");
    setLocalPlayTime("");
    setLocalDifficulty("");
    setLocalGenre("");
    pushQuery({ tab: "search" });
  };

  const handleTabChange = (nextTab: Tab) => {
    pushQuery(
      buildQuery({
        tab: nextTab,
        page: "1",
        q: query,
        players,
        time: playTime,
        difficulty,
        genre,
        searched: searched ? "1" : "",
      })
    );
  };

  const handleSearch = () => {
    pushQuery(
      buildQuery({
        tab: "search",
        page: "1",
        searched: "1",
        q: localQuery.trim(),
        players: localPlayers,
        time: localPlayTime,
        difficulty: localDifficulty,
        genre: localGenre,
      })
    );
  };

  const handleSearchReset = () => {
    setLocalQuery("");
    setLocalPlayers("");
    setLocalPlayTime("");
    setLocalDifficulty("");
    setLocalGenre("");
    pushQuery({ tab: "search" });
  };

  const handleSearchPageChange = (newPage: number) => {
    pushQuery(
      buildQuery({
        tab: "search",
        page: String(newPage),
        searched: "1",
        q: query,
        players,
        time: playTime,
        difficulty,
        genre,
      })
    );
  };

  const handleRankFilterChange = (
    patch: Partial<{ players: string; time: string; difficulty: string; genre: string }>
  ) => {
    pushQuery(
      buildQuery({
        tab: "ranking",
        page: "1",
        players: patch.players ?? players,
        time: patch.time ?? playTime,
        difficulty: patch.difficulty ?? difficulty,
        genre: patch.genre ?? genre,
      })
    );
  };

  const handleRankReset = () => {
    pushQuery({ tab: "ranking" });
  };

  const handleRankPageChange = (newPage: number) => {
    pushQuery(
      buildQuery({
        tab: "ranking",
        page: String(newPage),
        players,
        time: playTime,
        difficulty,
        genre,
      })
    );
  };

  return (
    <>
      <Head>
        <title>
          {tab === "ranking"
            ? "人気ランキング | ボードゲームランキング"
            : "ボードゲームを検索 | ボードゲームランキング"}
        </title>
      </Head>
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-purple-50">
        <header className="bg-white shadow-sm sticky top-0 z-10">
          <div className="max-w-2xl mx-auto px-4 py-4 flex items-center justify-between">
            <button
              onClick={handleLogoClick}
              className="flex items-center gap-2 hover:opacity-80 transition"
            >
              <img src="/img/boardgemeTop.png" alt="ボードゲームランキング" className="w-8 h-8 rounded-lg object-cover" />
              <span className="font-bold text-gray-900 text-sm">ボードゲームランキング</span>
            </button>
            <button
              onClick={() => void handleLogout()}
              className="text-sm text-gray-500 hover:text-indigo-600 transition"
            >
              ログアウト
            </button>
          </div>

          {/* タブ */}
          <div className="max-w-2xl mx-auto px-4">
            <div className="flex border-b border-gray-200">
              {(["search", "ranking"] as Tab[]).map((t) => {
                const label = t === "search" ? "検索" : "ランキング";
                return (
                  <button
                    key={t}
                    onClick={() => handleTabChange(t)}
                    className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                      tab === t
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
          {tab === "search" && (
            <div>
              <div className="mb-6">
                <h1 className="text-2xl font-bold text-gray-900">ボードゲームを検索</h1>
                <p className="text-sm text-gray-500 mt-1">条件を選んで検索ボタンを押してください</p>
              </div>

              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 mb-6 space-y-4">
                <div>
                  <label htmlFor="search-query" className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">キーワード</label>
                  <div className="relative">
                    <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none"
                      fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z" />
                    </svg>
                    <input
                      id="search-query"
                      type="text"
                      value={localQuery}
                      onChange={(e) => setLocalQuery(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                      placeholder="ゲーム名・タグで検索..."
                      className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="search-players" className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">プレイ人数</label>
                    <select id="search-players" value={localPlayers} onChange={(e) => setLocalPlayers(e.target.value)}
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition bg-white">
                      <option value="">すべて</option>
                      {PLAYER_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="search-playtime" className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">所要時間</label>
                    <select id="search-playtime" value={localPlayTime} onChange={(e) => setLocalPlayTime(e.target.value)}
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition bg-white">
                      <option value="">すべて</option>
                      {PLAY_TIME_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="search-difficulty" className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">難易度</label>
                    <select id="search-difficulty" value={localDifficulty} onChange={(e) => setLocalDifficulty(e.target.value)}
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition bg-white">
                      <option value="">すべて</option>
                      {DIFFICULTY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="search-genre" className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">ジャンル</label>
                    <select id="search-genre" value={localGenre} onChange={(e) => setLocalGenre(e.target.value)}
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition bg-white">
                      <option value="">すべて</option>
                      {genres.map((g) => <option key={g} value={g}>{g}</option>)}
                    </select>
                  </div>
                </div>

                <div className="flex gap-2 pt-1">
                  <button onClick={handleSearch}
                    className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2.5 rounded-lg transition text-sm">
                    検索
                  </button>
                  <button onClick={handleSearchReset}
                    className="px-4 py-2.5 border border-gray-200 text-gray-500 hover:text-gray-700 hover:border-gray-300 rounded-lg transition text-sm">
                    リセット
                  </button>
                </div>
              </div>

              {searched && (
                <div>
                  <p className="text-sm text-gray-500 mb-3">
                    {total > 0
                      ? `${total}件のゲームが見つかりました`
                      : "条件に一致するゲームが見つかりませんでした"}
                  </p>
                  {total > 0 && (
                    <>
                      <div className="space-y-3">
                        {games.map((game) => (
                          // 検索結果は連番の「上から数えた順位」ではなくBGG順位でもないため、
                          // rankを渡さずランクバッジを非表示にする（先頭3件に金銀銅が付く不具合の解消）
                          <GameCard key={game.id} game={game} showVotes={false} />
                        ))}
                      </div>
                      {total > PAGE_SIZE && (
                        <div className="flex items-center justify-center gap-2 mt-6">
                          <button
                            onClick={() => handleSearchPageChange(1)}
                            disabled={page === 1}
                            className="px-3 py-2 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
                          >
                            最初へ
                          </button>
                          <button
                            onClick={() => handleSearchPageChange(page - 1)}
                            disabled={page === 1}
                            className="px-3 py-2 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
                          >
                            前へ
                          </button>
                          <span className="text-sm text-gray-500 px-2">
                            {page} / {totalPages}
                          </span>
                          <button
                            onClick={() => handleSearchPageChange(page + 1)}
                            disabled={page >= totalPages}
                            className="px-3 py-2 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
                          >
                            次へ
                          </button>
                          <button
                            onClick={() => handleSearchPageChange(totalPages)}
                            disabled={page >= totalPages}
                            className="px-3 py-2 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
                          >
                            最後へ
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {tab === "ranking" && (
            <div>
              <div className="mb-6">
                <h1 className="text-2xl font-bold text-gray-900">ボードゲーム人気ランキング</h1>
                <p className="text-sm text-gray-500 mt-1">ランキング順</p>
              </div>

              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mb-6">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="rank-players" className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">プレイ人数</label>
                    <select id="rank-players" value={players} onChange={(e) => handleRankFilterChange({ players: e.target.value })}
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition bg-white">
                      <option value="">すべて</option>
                      {PLAYER_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="rank-playtime" className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">所要時間</label>
                    <select id="rank-playtime" value={playTime} onChange={(e) => handleRankFilterChange({ time: e.target.value })}
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition bg-white">
                      <option value="">すべて</option>
                      {PLAY_TIME_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="rank-difficulty" className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">難易度</label>
                    <select id="rank-difficulty" value={difficulty} onChange={(e) => handleRankFilterChange({ difficulty: e.target.value })}
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition bg-white">
                      <option value="">すべて</option>
                      {DIFFICULTY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="rank-genre" className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">ジャンル</label>
                    <select id="rank-genre" value={genre} onChange={(e) => handleRankFilterChange({ genre: e.target.value })}
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition bg-white">
                      <option value="">すべて</option>
                      {genres.map((g) => <option key={g} value={g}>{g}</option>)}
                    </select>
                  </div>
                </div>
                {isRankingFiltered && (
                  <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
                    <p className="text-sm text-gray-500">{total}件</p>
                    <button
                      onClick={handleRankReset}
                      className="text-xs text-indigo-600 hover:underline"
                    >
                      リセット
                    </button>
                  </div>
                )}
              </div>

              <div className="space-y-3">
                {games.map((game, index) => (
                  // bgg_rank 由来の絶対順位（bggRank）ではなく、絞り込み後の抽出結果内での
                  // 通し連番を表示する。絞り込みをかけると bggRank は 1, 5, 23, 87…のように
                  // 飛び飛びになり順位として意味を持たないため。並び順自体は bgg_rank 昇順
                  // （fetchGamesPage 側）のまま変えず、ページをまたいでも連番が続くよう
                  // ページ番号とページ内インデックスから算出する。
                  <GameCard key={game.id} game={game} rank={(page - 1) * PAGE_SIZE + index + 1} />
                ))}
              </div>
              {total > PAGE_SIZE && (
                <div className="flex items-center justify-center gap-2 mt-6">
                  <button
                    onClick={() => handleRankPageChange(1)}
                    disabled={page === 1}
                    className="px-3 py-2 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
                  >
                    最初へ
                  </button>
                  <button
                    onClick={() => handleRankPageChange(page - 1)}
                    disabled={page === 1}
                    className="px-3 py-2 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
                  >
                    前へ
                  </button>
                  <span className="text-sm text-gray-500 px-2">
                    {page} / {totalPages}
                  </span>
                  <button
                    onClick={() => handleRankPageChange(page + 1)}
                    disabled={page >= totalPages}
                    className="px-3 py-2 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
                  >
                    次へ
                  </button>
                  <button
                    onClick={() => handleRankPageChange(totalPages)}
                    disabled={page >= totalPages}
                    className="px-3 py-2 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
                  >
                    最後へ
                  </button>
                </div>
              )}
            </div>
          )}
        </main>
      </div>
    </>
  );
}
