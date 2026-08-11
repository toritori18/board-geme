type Size = "sm" | "lg";

type Props = {
  /**
   * BoardGameGeek のユーザー評価の平均値（0〜10 のスケールで渡すこと）。
   * このコンポーネント自体は星5つで表示するため、内部で5段階に換算する。
   */
  rating: number;
  size?: Size;
};

// BGG のユーザー評価は1〜10段階で登録される（実データ: min 1.05 / max 9.58、2026-08-11時点）。
// このコンポーネントは星5つで表示するため、2で割って5段階に換算する。
const MAX_RATING = 10;

// Tailwind はソースコードを文字列として走査し、そこに現れるクラス名の完全な文字列からのみ
// スタイルを生成する。`w-${n} h-${n}` のように実行時に組み立てると、走査時にクラス名が
// 見つからずスタイルが生成されない（星が消える）。そのため、サイズごとの完全なクラス名を
// あらかじめ定数として持ち、実行時にはこの中から選ぶだけにする。
const SIZE_CLASS = {
  sm: {
    star: "w-4 h-4",
    inactiveColor: "text-gray-300",
    label: "text-sm font-semibold text-gray-700 ml-1",
  },
  lg: {
    star: "w-5 h-5",
    inactiveColor: "text-gray-200",
    label: "text-xl font-bold text-gray-800 ml-1",
  },
} as const;

const ACTIVE_COLOR = "text-yellow-400";

export default function StarRating({ rating, size = "sm" }: Props) {
  const { star, inactiveColor, label } = SIZE_CLASS[size];

  // 10段階評価を5段階に換算する。想定外の値（10超や負値）が混ざっても
  // 星の点灯数が範囲外にならないよう [0, 5] にクランプする。
  const filledStars = Math.min(5, Math.max(0, Math.round(rating / (MAX_RATING / 5))));

  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((starIndex) => (
        <svg
          key={starIndex}
          className={`${star} ${starIndex <= filledStars ? ACTIVE_COLOR : inactiveColor}`}
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      ))}
      {/* 星は5段階、数字は10段階のままなので、換算スケールの違いが分かるよう明示する */}
      <span className={label}>{rating.toFixed(1)} / {MAX_RATING}</span>
    </div>
  );
}
