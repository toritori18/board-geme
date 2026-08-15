import { useId } from "react";

type Size = "sm" | "lg";

type Props = {
  /**
   * BoardGameGeek のユーザー評価の平均値（0〜10 のスケールで渡すこと）。
   * このコンポーネント自体は星のアイコン・数値ラベルともに5段階で表示するため、
   * 内部で5段階に換算する。
   */
  rating: number;
  size?: Size;
};

// BGG のユーザー評価は1〜10段階で登録される（実データ: min 1.05 / max 9.58、2026-08-11時点）。
// このコンポーネントは星のアイコン・数値ラベルをどちらも5段階で表示するため、
// MAX_RATING / STAR_MAX（= 2）で割って5段階に換算する。
const MAX_RATING = 10;
const STAR_MAX = 5;

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

// 星の輪郭を表すpath。土台（グレー）と塗り部分（黄色、clipPathで一部のみ表示）の
// 2箇所で同じ形を描くため、長大なパス文字列を定数に切り出して二重管理を避ける。
const STAR_PATH_D =
  "M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z";

// 星1つ分のpath。clipPathIdを渡すと、参照先のclipPathで指定した範囲だけが表示される
// （端数の星の塗り部分の描画に使う。土台のグレー星はclipPathIdを渡さず全体を描く）。
// fill="currentColor" は親のsvgではなくこのpath自身に付ける。currentcolorは要素自身の
// colorに対して解決される仕様のため本来は親に付けても問題ないはずだが、className（＝色）を
// 持つ要素とfillを持つ要素を一致させることで、仕様解釈に依存せず色の解決先を確定させる。
function StarPath({ className, clipPathId }: { className: string; clipPathId?: string }) {
  return (
    <path
      className={className}
      fill="currentColor"
      d={STAR_PATH_D}
      clipPath={clipPathId ? `url(#${clipPathId})` : undefined}
    />
  );
}

export default function StarRating({ rating, size = "sm" }: Props) {
  const { star, inactiveColor, label } = SIZE_CLASS[size];

  // 10段階評価を5段階に換算した値。星の塗り割合・数値ラベルの両方をこの値から
  // 導出することで、換算式を二重管理しない。想定外の値（10超や負値）が混ざっても
  // 表示が範囲外にならないよう [0, STAR_MAX] にクランプする。
  const convertedRating = Math.min(STAR_MAX, Math.max(0, rating / (MAX_RATING / STAR_MAX)));

  // clipPathのidはページ内で一意である必要がある（StarRatingは1ページに何十個も描画され、
  // 星5つ分idを持つため衝突しやすい。衝突すると別の星のclipPathが誤って適用され、
  // 塗り位置がずれてしまう）。useId()はコンポーネントインスタンスごとに一意な値を
  // SSR/クライアントで一致する形で返すため、これを接頭辞に使う。戻り値（例: ":r0:"）には
  // url(#...) 参照と相性が悪い `:` が含まれるため除去する。
  const idPrefix = useId().replace(/:/g, "");

  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((starIndex) => {
        // 星ごとの塗り割合（0〜1）。0.5刻みなどに丸めず連続値のまま反映する。
        const fillRatio = Math.min(1, Math.max(0, convertedRating - (starIndex - 1)));
        const clipId = `${idPrefix}-star-${starIndex}`;

        return (
          <svg key={starIndex} className={star} viewBox="0 0 20 20">
            {/*
              端数の星を部分的に塗るため、グレーの星の上に黄色の星をclipPathで
              左からfillRatioの割合だけ切り抜いて重ね描きする。CSSのstyle属性は
              docs/contributing.mdで禁止されており、Tailwindの静的クラスでは
              連続値の幅を表現できないため、CSS/Tailwindではなく、SVG自体が持つ
              clipPath+rectという図形属性（viewBoxと同じuser space上の座標）で解決する。
            */}
            <defs>
              <clipPath id={clipId}>
                <rect x={0} y={0} width={fillRatio * 20} height={20} />
              </clipPath>
            </defs>
            <StarPath className={inactiveColor} />
            <StarPath className={ACTIVE_COLOR} clipPathId={clipId} />
          </svg>
        );
      })}
      <span className={label}>
        {convertedRating.toFixed(1)} / {STAR_MAX}
      </span>
    </div>
  );
}
