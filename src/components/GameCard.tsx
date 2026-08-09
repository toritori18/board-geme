import Link from "next/link";
import type { Game } from "@/types/game";
import StarRating from "@/components/StarRating";

type Props = {
  game: Game;
  rank: number;
  showVotes?: boolean;
};

export default function GameCard({ game, rank, showVotes = true }: Props) {
  const rankColors: Record<number, string> = {
    1: "bg-yellow-400 text-yellow-900",
    2: "bg-gray-300 text-gray-700",
    3: "bg-amber-600 text-amber-100",
  };
  const rankClass = rankColors[rank] ?? "bg-indigo-100 text-indigo-700";

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 flex items-start gap-4 hover:shadow-md hover:border-indigo-200 transition-all">
      <div
        className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg shrink-0 ${rankClass}`}
      >
        {rank}
      </div>
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
