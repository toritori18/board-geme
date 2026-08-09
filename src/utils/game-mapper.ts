import { supabaseAdmin } from "@/utils/supabase-admin";
import type { Game } from "@/types/game";

type DbGame = {
  id: number;
  game_name: string;
  game_name_ja: string | null;
  min_players: number | null;
  max_players: number | null;
  play_time: number | null;
  min_age: number | null;
  users_rated: number | null;
  rating_average: number | null;
  bgg_rank: number | null;
  complexity_average: number | null;
  description_ja: string | null;
  short_description_ja: string | null;
  game_domain_id: number[] | null;
};

const GAME_SELECT =
  "id, game_name, game_name_ja, min_players, max_players, play_time, min_age, users_rated, rating_average, bgg_rank, complexity_average, description_ja, short_description_ja, game_domain_id";

export type GameFilters = {
  query?: string;
  players?: string; // "1"〜"5"（"5" は5人以上）
  playTime?: string; // "30" | "60" | "120" | "121"
  difficulty?: string; // "初心者向け" | "中級者向け" | "上級者向け"
  genre?: string; // ジャンル名
};

export type GameSort = "rank" | "rating";

async function buildGenreMap(): Promise<Map<number, string>> {
  const { data, error } = await supabaseAdmin
    .from("M_GAME_GENRE")
    .select("id, game_genre_name_ja");
  // エラーを握り潰すと、DB障害時にジャンル0件として扱われ「タグ無し」の
  // 正常ページが描画されてしまう（H-4）。呼び出し元に伝播させる。
  if (error) throw error;
  const map = new Map<number, string>();
  for (const genre of data ?? []) {
    const id = genre.id as number;
    const name = genre.game_genre_name_ja as string | null;
    if (name) map.set(id, name);
  }
  return map;
}

function findGenreIdByName(genreMap: Map<number, string>, name: string): number | null {
  for (const [id, genreName] of genreMap) {
    if (genreName === name) return id;
  }
  return null;
}

// キーワード検索でジャンルタグも拾うため、ジャンル名に部分一致するジャンルIDを集める
function findGenreIdsContaining(genreMap: Map<number, string>, keyword: string): number[] {
  const lower = keyword.toLowerCase();
  const ids: number[] = [];
  for (const [id, genreName] of genreMap) {
    if (genreName.toLowerCase().includes(lower)) ids.push(id);
  }
  return ids;
}

/**
 * PostgRESTの `.or()` はフィルタ条件を文字列として組み立てて送信するため、
 * ユーザー入力をそのまま埋め込むと `,`（条件区切り）・`()`（グループ化）・
 * `*`（ilikeのワイルドカード）などを使ってフィルタの構造そのものを
 * 書き換えられてしまう（フィルタインジェクション）。埋め込み前に、
 * PostgRESTのフィルタ構文で特別な意味を持つ制御文字を除去し、
 * 単なる検索語として扱えるようにする。
 */
function sanitizeForOrFilter(input: string): string {
  return input.replace(/[,.()*"\\:]/g, "");
}

function mapRow(row: DbGame, genreMap: Map<number, string>): Game {
  const minP = row.min_players ?? 1;
  const maxP = row.max_players ?? 1;
  const players = minP === maxP ? `${minP}人` : `${minP}〜${maxP}人`;
  const complexity = Number(row.complexity_average ?? 0);
  const difficulty =
    complexity < 2.0 ? "初心者向け" : complexity <= 3.5 ? "中級者向け" : "上級者向け";

  return {
    id: row.id,
    name: row.game_name_ja ?? row.game_name,
    nameEn: row.game_name,
    description: row.description_ja ?? "",
    shortDescription: row.short_description_ja ?? "",
    players,
    playTime: row.play_time ? `${row.play_time}分` : "不明",
    minAge: row.min_age ?? 0,
    rating: Number(row.rating_average ?? 0),
    votes: row.users_rated ?? 0,
    difficulty,
    tags: (row.game_domain_id ?? []).map((id) => genreMap.get(id) ?? "").filter(Boolean),
  };
}

export async function fetchGamesPage(params: {
  page: number;
  pageSize: number;
  filters: GameFilters;
  sort: GameSort;
}): Promise<{ games: Game[]; total: number }> {
  const { page, pageSize, filters, sort } = params;
  const genreMap = await buildGenreMap();

  // ジャンル名からIDを引けない場合、該当するゲームは存在しないので即0件を返す
  let genreId: number | null = null;
  if (filters.genre) {
    genreId = findGenreIdByName(genreMap, filters.genre);
    if (genreId === null) {
      return { games: [], total: 0 };
    }
  }

  let queryBuilder = supabaseAdmin.from("T_GAME").select(GAME_SELECT, { count: "exact" });

  if (filters.players) {
    const count = Number(filters.players);
    if (count === 5) {
      queryBuilder = queryBuilder.gte("max_players", 5);
    } else if (Number.isFinite(count)) {
      queryBuilder = queryBuilder.lte("min_players", count).gte("max_players", count);
    }
  }

  // play_time が NULL の行は lte/gte による比較結果が SQL 上 NULL（不明）になり、
  // WHERE句からは自然に除外される。これにより、クライアント側実装にあった
  // 「playTimeが"不明"のとき parseInt が NaN になり比較が常にfalseとなって
  // NULLの行が全時間フィルタを素通りしてしまう不具合」と、
  // 「境界が `max < 120` だったため120分ちょうどのゲームが
  // 重量級・超重量級の両方に重複計上される不具合」がどちらも解消される。
  if (filters.playTime === "30") {
    queryBuilder = queryBuilder.lte("play_time", 30);
  } else if (filters.playTime === "60") {
    queryBuilder = queryBuilder.gte("play_time", 31).lte("play_time", 60);
  } else if (filters.playTime === "120") {
    queryBuilder = queryBuilder.gte("play_time", 61).lte("play_time", 120);
  } else if (filters.playTime === "121") {
    queryBuilder = queryBuilder.gt("play_time", 120);
  }

  // 難易度の境界は mapRow() のラベル付け（complexity_average ?? 0 を用いるため
  // NULL は「初心者向け」に分類される）と必ず一致させる。NULLを初心者向けに含めるのは
  // データ欠損を「易しい」と誤認させる既知の課題（レビューのM-3）だが、今回の修正対象外
  // なので、表示（mapRow）と絞り込みの整合を優先する。
  if (filters.difficulty === "初心者向け") {
    queryBuilder = queryBuilder.or("complexity_average.lt.2.0,complexity_average.is.null");
  } else if (filters.difficulty === "中級者向け") {
    queryBuilder = queryBuilder.gte("complexity_average", 2.0).lte("complexity_average", 3.5);
  } else if (filters.difficulty === "上級者向け") {
    queryBuilder = queryBuilder.gt("complexity_average", 3.5);
  }

  if (genreId !== null) {
    queryBuilder = queryBuilder.contains("game_domain_id", [genreId]);
  }

  if (filters.query) {
    const sanitized = sanitizeForOrFilter(filters.query.trim());
    // サニタイズ後に空文字になった場合（制御文字のみの入力等）はキーワード条件を付けない
    if (sanitized) {
      const matchedGenreIds = findGenreIdsContaining(genreMap, sanitized);
      const orParts = [
        `game_name.ilike.*${sanitized}*`,
        `game_name_ja.ilike.*${sanitized}*`,
        `short_description_ja.ilike.*${sanitized}*`,
      ];
      if (matchedGenreIds.length > 0) {
        orParts.push(`game_domain_id.ov.{${matchedGenreIds.join(",")}}`);
      }
      queryBuilder = queryBuilder.or(orParts.join(","));
    }
  }

  if (sort === "rank") {
    queryBuilder = queryBuilder.order("bgg_rank", { ascending: true, nullsFirst: false });
  } else {
    // PostgreSQLのORDER BYはデフォルトでNULLを「他のどの値よりも大きい」扱いとするため、
    // 降順(DESC)の既定はNULLS FIRSTとなりNULLが先頭に来てしまう
    // （出典: https://www.postgresql.org/docs/current/queries-order.html ）。
    // mapRow() ではrating_averageがNULLの行を0点として扱っており実質最下位のはずなので、
    // 現行のランキングタブの並び（評価0点は下位）を再現するため nullsFirst: false を明示する。
    queryBuilder = queryBuilder
      .order("rating_average", { ascending: false, nullsFirst: false })
      .order("users_rated", { ascending: false, nullsFirst: false });
  }

  const from = (page - 1) * pageSize;
  const to = page * pageSize - 1;
  const { data, error, count } = await queryBuilder.range(from, to);
  if (error) throw error;

  return {
    games: (data ?? []).map((row) => mapRow(row as DbGame, genreMap)),
    total: count ?? 0,
  };
}

export async function fetchGenres(): Promise<string[]> {
  const genreMap = await buildGenreMap();
  // 同名ジャンルが複数IDに存在した場合、選択肢の<option>キーが重複しないようSetで一意化する
  return Array.from(new Set(genreMap.values()));
}

export async function fetchGameById(
  id: number
): Promise<{ game: Game | null; bggRank: number }> {
  const [genreMap, { data, error }] = await Promise.all([
    buildGenreMap(),
    supabaseAdmin.from("T_GAME").select(GAME_SELECT).eq("id", id).maybeSingle(),
  ]);
  // maybeSingle()は0件のとき data: null / error: null を返すため、
  // 「該当行が無い」場合と「本当のDB障害」を区別できる（.single()だと0件もエラーになる）
  if (error) throw error;
  if (!data) return { game: null, bggRank: 0 };
  const row = data as DbGame;
  return { game: mapRow(row, genreMap), bggRank: row.bgg_rank ?? 0 };
}
