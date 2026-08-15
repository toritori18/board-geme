import Link from "next/link";
import type { Game } from "@/types/game";
import StarRating from "@/components/StarRating";

type Props = {
  game: Game;
  // 表示する順位の数値。値の意味（抽出結果内の連番かBGG順位か等）は呼び出し元が決める
  // （ranking.tsxのランキングタブでは絞り込み後の抽出結果内の連番を渡す）。検索結果は
  // 順位としての意味を持たないため、rankを渡さない（バッジ非表示）呼び出しを許容する
  rank?: number | null;
  showVotes?: boolean;
};

// rank には抽出結果内の連番を渡す想定だが、絞り込みをかけなければ全件
// （実データ: 2026-08-11時点でT_GAME 20,327件）が対象になり得るため、連番であっても
// 最大5桁になり得る。固定幅の円(w-10)ではテキストがはみ出すため、桁数区分ごとに
// クラス名を切り替える。Tailwindはソースコードを文字列として走査するため、
// `text-${n}` のように実行時にクラス名を組み立てるとスタイルが生成されない。
// 桁数区分ごとの完全なクラス名をあらかじめ定数として持ち、実行時にはこの中から
// 選ぶだけにする（StarRating.tsx の SIZE_CLASS と同じ理由・同じ書き方）。
const RANK_TEXT_CLASS = {
  short: "text-lg", // 1〜2桁
  medium: "text-base", // 3桁
  long: "text-sm", // 4桁以上
} as const;

function rankTextSizeKey(rank: number): keyof typeof RANK_TEXT_CLASS {
  const digits = String(rank).length;
  if (digits <= 2) return "short";
  if (digits === 3) return "medium";
  return "long";
}

export default function GameCard({ game, rank, showVotes = true }: Props) {
  const rankColors: Record<number, string> = {
    1: "bg-yellow-400 text-yellow-900",
    2: "bg-gray-300 text-gray-700",
    3: "bg-amber-600 text-amber-100",
  };
  const rankClass = rank != null ? (rankColors[rank] ?? "bg-indigo-100 text-indigo-700") : "";
  const rankTextClass = rank != null ? RANK_TEXT_CLASS[rankTextSizeKey(rank)] : "";

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 flex items-start gap-4 hover:shadow-md hover:border-indigo-200 transition-all">
      {rank != null && (
        // 固定幅の円(w-10)ではなく最小幅(min-w-10)のピル型にすることで、
        // 1〜2桁のときは今までどおり円に見えつつ、3桁以上でも横に伸びて収まる
        <div
          className={`min-w-10 h-10 px-2 rounded-full flex items-center justify-center font-bold shrink-0 ${rankTextClass} ${rankClass}`}
        >
          {rank}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <h2 className="text-lg font-bold text-gray-900">{game.name}</h2>
        </div>
        <p className="text-sm text-gray-500 mt-1">{game.shortDescription}</p>
        <div className="mt-2 flex items-center gap-4 flex-wrap">
          <StarRating rating={game.rating} />
          {showVotes && <span className="text-xs text-gray-400">{game.votes.toLocaleString()}票</span>}
          <span className="text-xs text-gray-400">{game.players}</span>
          <span className="text-xs text-gray-400">{game.playTime}</span>
        </div>
        <div className="mt-3 flex items-center justify-between flex-wrap gap-2">
          <div className="flex gap-1 flex-wrap">
            {game.tags.map((tag) => (
              <span
                key={tag}
                className="text-xs bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full"
              >
                {tag}
              </span>
            ))}
          </div>
          <Link
            href={`/games/${game.id}`}
            className="shrink-0 text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-1.5 rounded-lg transition"
          >
            詳細
          </Link>
        </div>
      </div>
    </div>
  );
}
