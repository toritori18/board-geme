/**
 * サーバー専用のゲーム取得ユーティリティ。
 *
 * service role キー（`supabaseAdmin`、src/utils/supabase-admin.ts）を import するため、
 * クライアントコンポーネントから import しないこと（service role キーがクライアントの
 * JS バンドルに混入し、ブラウザから閲覧・悪用できる状態になる）。現状は
 * getServerSideProps からのみ呼ばれているため、Next.js のビルド時のツリーシェイクで
 * クライアント向けバンドルからは除去されているが、うっかりコンポーネント側から
 * import すると、この前提が崩れて壊れる（src/utils/session.ts 冒頭コメントと同趣旨）。
 */
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

// M_GAME_GENRE はゲーム投入スクリプトでしか更新されない実質不変のデータ
// （実データ: 2026-08-11時点で数件〜十数件規模）。1リクエストの getServerSideProps が
// fetchGenres() と fetchGamesPage() の両方を呼び、その両方が buildGenreMap() を
// 実行するため、キャッシュ無しだと同じテーブルを1リクエストで2回読みに行くことになる。
// プロセス内キャッシュで重複を減らす。
//
// Vercel のサーバーレス環境ではインスタンスごとにメモリが独立しているため
// （src/utils/rate-limit.ts 冒頭コメント参照）、このキャッシュは
// 「1リクエスト内の重複排除」と「同一インスタンスが使い回される間の再利用」を
// 狙ったものであり、全リクエストを通じて取得回数が1回に減る保証は無い。
//
// 出典なし: TTLの具体的な秒数に根拠となる一次資料は無く、このプロジェクトの暫定値
// （src/utils/rate-limit.ts の閾値と同じ位置づけ）である。
const GENRE_MAP_CACHE_TTL_MS = 5 * 60 * 1000;
let genreMapCache: { map: Map<number, string>; expiresAt: number } | null = null;

async function buildGenreMap(): Promise<Map<number, string>> {
  if (genreMapCache && genreMapCache.expiresAt > Date.now()) {
    return genreMapCache.map;
  }

  const { data, error } = await supabaseAdmin
    .from("M_GAME_GENRE")
    .select("id, game_genre_name_ja");
  // エラーを握り潰すと、DB障害時にジャンル0件として扱われ「タグ無し」の
  // 正常ページが描画されてしまう（H-4）。呼び出し元に伝播させる。
  // ここで throw した場合は下のキャッシュ更新に到達しないため、失敗した結果を
  // キャッシュしてしまうことはない。
  if (error) throw error;
  const map = new Map<number, string>();
  for (const genre of data ?? []) {
    const id = genre.id as number;
    const name = genre.game_genre_name_ja as string | null;
    if (name) map.set(id, name);
  }
  genreMapCache = { map, expiresAt: Date.now() + GENRE_MAP_CACHE_TTL_MS };
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
 * SQLのLIKE演算子が特別扱いするワイルドカード `%` `_` と、PostgRESTが `ilike` で
 * `%` に変換するワイルドカード `*` を除去する。除去しないと、例えば `%` 単体の
 * 入力が `ilike '%%%'` として解釈されて実質「全件マッチ」になり、
 * `count: "exact"` と組み合わさって2万件超（実データ: 2026-08-11時点でT_GAME 20,327件）の
 * 全表走査が走ってしまう。
 *
 * `\`（バックスラッシュ）も除去対象に含める。PostgreSQLのLIKEは既定で `\` を
 * エスケープ文字として扱うため、残すと直後の1文字を「エスケープされた文字」として
 * 無効化してしまい、利用者から見て理解できない挙動になる
 * （実データ: 2026-08-11時点で `a\b` での検索は `ab` での検索と同じ430件がヒットし、
 * `game_name ilike '%ab%'` の基準件数とも一致した。つまり `a\b` が `ab` と
 * 同じ意味に解釈されている）。
 */
function stripLikeWildcards(input: string): string {
  return input.replace(/[%_*\\]/g, "");
}

/**
 * PostgRESTの `.or()` はフィルタ条件を文字列として組み立てて送信するため、
 * ユーザー入力をそのまま埋め込むと `,`（条件区切り）・`()`（グループ化）などを
 * 使ってフィルタの構造そのものを書き換えられてしまう（フィルタインジェクション）。
 * 除去ではなく値全体を二重引用符で囲むことで、`Mr. Jack` や
 * `Descent: Journeys in the Dark` のような `.` `:` `(` `)` `"` を含む検索語も
 * 文字化けさせずに検索できるようにする。
 *
 * PostgREST公式ドキュメント（URL Grammar > Reserved Characters）によると、
 * フィルタ構文の予約文字は `,` `.` `:` `*` `(` `)` であり、これらを値として
 * 扱いたい場合は値全体を二重引用符で囲む必要がある。二重引用符の内側では
 * `"` を `\"` に、`\` を `\\` にエスケープする。置換順序を誤ると
 * （`"`→`\"` を先に行うと）その後の `\`→`\\` 置換で自分が挿入したエスケープ用の
 * `\` まで二重にエスケープしてしまうため、`\`→`\\` を先に行う。
 *
 * なお、上記のエスケープ規則は公式ドキュメントでは `in` 演算子の文脈で説明されており、
 * `ilike` のワイルドカード `*` を二重引用符の内側に置いたときにワイルドカードとして
 * 解釈されるかは公式ドキュメントに記載が無い。ただしこの点は実データで確認済み
 * （実データ: 2026-08-11時点でT_GAME 20,327件に対し、`"*Catan*"`（二重引用符あり）の
 * `ilike` 検索は二重引用符無しの `*Catan*` と同じ29件を返し、単一カラムの
 * `game_name ilike '%Catan%'` の基準件数とも一致した。二重引用符の内側でも `*` は
 * ワイルドカードとして解釈される）。
 */
function quoteFilterValue(value: string): string {
  const escaped = value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `"${escaped}"`;
}

function mapRow(row: DbGame, genreMap: Map<number, string>): Game {
  const minP = row.min_players ?? 1;
  const maxP = row.max_players ?? 1;
  const players = minP === maxP ? `${minP}人` : `${minP}〜${maxP}人`;
  // complexity_average は 1〜5 が有効値で、0 は「難易度データ無し」を意味する
  // （実データ: 20,327件中 NULL は0件、0 は426件、0より大きい最小値は 1）。
  // NULL と同じく「不明」として扱い、データ欠損を「易しい」と誤認させない。
  const complexity = row.complexity_average;
  const difficulty =
    complexity == null || complexity <= 0
      ? "不明"
      : complexity < 2.0
        ? "初心者向け"
        : complexity <= 3.5
          ? "中級者向け"
          : "上級者向け";
  // bgg_rank は 0 または NULL を「順位データ無し」として null に正規化する
  // （実データ: 2026-08-11時点でT_GAME 20,327件中 bgg_rankが0の行・NULLの行は
  // いずれも0件、最小1・最大20344・重複0件だったが、complexity_average(上記)や
  // play_time(下記)と同じ方針で防御的に扱う。将来のデータ更新で欠損が入っても
  // 「#0」のような無効な順位を画面に出さないため）。
  const bggRank = row.bgg_rank != null && row.bgg_rank > 0 ? row.bgg_rank : null;

  return {
    id: row.id,
    name: row.game_name_ja ?? row.game_name,
    nameEn: row.game_name,
    // description_ja は長文説明用だが未生成（実データ: 20,327件中 9,985件が空文字）。
    // 空のときは短文で代替し、どちらも無ければ空文字のまま表示側でセクションを畳む。
    description: row.description_ja || row.short_description_ja || "",
    shortDescription: row.short_description_ja ?? "",
    players,
    // play_time は 0 が「所要時間データ無し」を意味するため、NULL と同じく「不明」として扱う
    playTime: row.play_time != null && row.play_time > 0 ? `${row.play_time}分` : "不明",
    minAge: row.min_age ?? 0,
    rating: Number(row.rating_average ?? 0),
    votes: row.users_rated ?? 0,
    difficulty,
    bggRank,
    tags: (row.game_domain_id ?? []).map((id) => genreMap.get(id) ?? "").filter(Boolean),
  };
}

// fetchGamesPage() の一覧取得クエリと、範囲外ページ時の件数のみ取得クエリ（後述）の
// 両方から呼べるよう、フィルタ条件の組み立てを共通化する。gte/lte/gt/lt/contains/or は
// いずれも `this` を返す（メソッドチェーンで自分自身の型を返す）ため、T を自分自身に
// 制約する形で汎用的に書ける。
type GameFilterQuery<T> = {
  gte(column: string, value: unknown): T;
  lte(column: string, value: unknown): T;
  gt(column: string, value: unknown): T;
  lt(column: string, value: unknown): T;
  contains(column: string, value: unknown): T;
  or(filters: string): T;
};

function applyGameFilters<T extends GameFilterQuery<T>>(
  queryBuilder: T,
  genreMap: Map<number, string>,
  genreId: number | null,
  filters: GameFilters
): T {
  let qb = queryBuilder;

  if (filters.players) {
    const count = Number(filters.players);
    if (count === 5) {
      qb = qb.gte("max_players", 5);
    } else if (Number.isFinite(count)) {
      qb = qb.lte("min_players", count).gte("max_players", count);
    }
  }

  // play_time が NULL の行は lte/gte による比較結果が SQL 上 NULL（不明）になり、
  // WHERE句からは自然に除外される。これにより、クライアント側実装にあった
  // 「playTimeが"不明"のとき parseInt が NaN になり比較が常にfalseとなって
  // NULLの行が全時間フィルタを素通りしてしまう不具合」と、
  // 「境界が `max < 120` だったため120分ちょうどのゲームが
  // 重量級・超重量級の両方に重複計上される不具合」がどちらも解消される。
  // 軽量級のみ下限(gte 1)を付ける。play_time = 0 は mapRow() で「不明」表示となるため、
  // フィルタ側でも除外して表示と絞り込みの整合を取る。
  if (filters.playTime === "30") {
    qb = qb.gte("play_time", 1).lte("play_time", 30);
  } else if (filters.playTime === "60") {
    qb = qb.gte("play_time", 31).lte("play_time", 60);
  } else if (filters.playTime === "120") {
    qb = qb.gte("play_time", 61).lte("play_time", 120);
  } else if (filters.playTime === "121") {
    qb = qb.gt("play_time", 120);
  }

  // 難易度の境界は mapRow() のラベル付けと必ず一致させる。
  // complexity_average = 0 は mapRow() で「不明」表示となるため、初心者向けに下限(gt 0)を
  // 付けてフィルタ側からも除外する。NULL は gt/lt の比較結果が SQL 上 NULL となり
  // WHERE 句から自然に除外されるため、明示的な条件は不要（三値論理）。
  if (filters.difficulty === "初心者向け") {
    qb = qb.gt("complexity_average", 0).lt("complexity_average", 2.0);
  } else if (filters.difficulty === "中級者向け") {
    qb = qb.gte("complexity_average", 2.0).lte("complexity_average", 3.5);
  } else if (filters.difficulty === "上級者向け") {
    qb = qb.gt("complexity_average", 3.5);
  }

  if (genreId !== null) {
    qb = qb.contains("game_domain_id", [genreId]);
  }

  if (filters.query) {
    const sanitized = stripLikeWildcards(filters.query.trim());
    // サニタイズ後に空文字になった場合（ワイルドカードのみの入力等）はキーワード条件を付けない
    if (sanitized) {
      const matchedGenreIds = findGenreIdsContaining(genreMap, sanitized);
      // "*...*" の前後の * は「部分一致」を表すためこちらで付与するワイルドカードで、
      // quoteFilterValue() で二重引用符に囲んだ後もPostgREST側でワイルドカードとして
      // 解釈されることを実データで確認済み（詳細は上記quoteFilterValue()のJSDoc参照）。
      const keyword = quoteFilterValue(`*${sanitized}*`);
      const orParts = [
        `game_name.ilike.${keyword}`,
        `game_name_ja.ilike.${keyword}`,
        `short_description_ja.ilike.${keyword}`,
      ];
      if (matchedGenreIds.length > 0) {
        orParts.push(`game_domain_id.ov.{${matchedGenreIds.join(",")}}`);
      }
      qb = qb.or(orParts.join(","));
    }
  }

  return qb;
}

export async function fetchGamesPage(params: {
  page: number;
  pageSize: number;
  filters: GameFilters;
}): Promise<{ games: Game[]; total: number }> {
  const { page, pageSize, filters } = params;
  const genreMap = await buildGenreMap();

  // ジャンル名からIDを引けない場合、該当するゲームは存在しないので即0件を返す
  let genreId: number | null = null;
  if (filters.genre) {
    genreId = findGenreIdByName(genreMap, filters.genre);
    if (genreId === null) {
      return { games: [], total: 0 };
    }
  }

  const queryBuilder = applyGameFilters(
    supabaseAdmin.from("T_GAME").select(GAME_SELECT, { count: "exact" }),
    genreMap,
    genreId,
    filters
  );

  // ランキング・検索とも BoardGameGeek 公表の順位（bgg_rank 昇順）で並べる。
  // rating_average 降順では評価数30件台のゲームが上位を占め、「人気ランキング」として成立しない。
  // bgg_rank だけを並び替えキーにすると、同順位の行が複数あった場合にDB内部の並び順が
  // 不定でページ境界にまたがってゲームが重複・欠落しうる（実データ: 2026-08-11時点で
  // bgg_rankの重複は0件だが、将来のデータ更新で重複が発生しても壊れないよう、
  // 一意な id を第2ソートキーとして固定する）。
  const orderedQueryBuilder = queryBuilder
    .order("bgg_rank", { ascending: true, nullsFirst: false })
    .order("id", { ascending: true });

  const from = (page - 1) * pageSize;
  const to = page * pageSize - 1;
  const { data, error, count } = await orderedQueryBuilder.range(from, to);

  if (error) {
    // PGRST103は、指定した range がテーブルの実際の行数を超えているときに
    // PostgRESTが返すエラーコード。ページ末尾より先のページ番号
    // （例: ページングUIの範囲外を直接指すURLを開いた場合）で発生する。
    // 実データで確認済み（2026-08-11時点、T_GAME 20,327件・PAGE_SIZE=20）:
    // range(20320, 20339)（最終ページ）は成功して7件を返すが、
    // range(20340, 20359)（その次）は PGRST103 "Requested range not satisfiable" になる。
    // ここでクラッシュさせず「0件」として扱い、正しい総件数だけ取り直して返す
    // （getServerSideProps 側はこの total を見て最終ページへリダイレクトする）。
    if (error.code === "PGRST103") {
      const countBuilder = applyGameFilters(
        supabaseAdmin.from("T_GAME").select("id", { count: "exact", head: true }),
        genreMap,
        genreId,
        filters
      );
      const { count: totalCount, error: countError } = await countBuilder;
      if (countError) throw countError;
      return { games: [], total: totalCount ?? 0 };
    }
    throw error;
  }

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

export async function fetchGameById(id: number): Promise<Game | null> {
  const [genreMap, { data, error }] = await Promise.all([
    buildGenreMap(),
    supabaseAdmin.from("T_GAME").select(GAME_SELECT).eq("id", id).maybeSingle(),
  ]);
  // maybeSingle()は0件のとき data: null / error: null を返すため、
  // 「該当行が無い」場合と「本当のDB障害」を区別できる（.single()だと0件もエラーになる）
  if (error) throw error;
  if (!data) return null;
  // 順位は Game.bggRank に一本化されているため、ここでは mapRow() の結果をそのまま返す
  // （呼び出し元ごとに bgg_rank を個別に持つと、正規化ロジック（0/NULL→null）が二重管理になる）
  return mapRow(data as DbGame, genreMap);
}
