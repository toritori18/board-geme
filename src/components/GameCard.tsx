import Link from "next/link";
import type { Game } from "@/types/game";

type Props = {
  game: Game;
  rank: number;
};

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((star) => (
        <svg
          key={star}
          className={`w-4 h-4 ${
            star <= Math.round(rating) ? "text-yellow-400" : "text-gray-300"
          }`}
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      ))}
      <span className="text-sm font-semibold text-gray-700 ml-1">{rating.toFixed(1)}</span>
    </div>
  );
}

export default function GameCard({ game, rank }: Props) {
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
          <span className="text-sm text-gray-400">{game.nameEn}</span>
        </div>
        <p className="text-sm text-gray-500 mt-1">{game.shortDescription}</p>
        <div className="mt-2 flex items-center gap-4 flex-wrap">
          <StarRating rating={game.rating} />
          <span className="text-xs text-gray-400">{game.votes.toLocaleString()}票</span>
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
