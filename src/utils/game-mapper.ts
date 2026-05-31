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

async function buildGenreMap(): Promise<Map<number, string>> {
  const { data } = await supabaseAdmin
    .from("M_GAME_GENRE")
    .select("id, game_genre_name_ja");
  const map = new Map<number, string>();
  for (const genre of data ?? []) {
    const id = genre.id as number;
    const name = genre.game_genre_name_ja as string | null;
    if (name) map.set(id, name);
  }
  return map;
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

export async function fetchGames(): Promise<Game[]> {
  const [genreMap, { data }] = await Promise.all([
    buildGenreMap(),
    supabaseAdmin.from("T_GAME").select(GAME_SELECT).order("bgg_rank", { ascending: true }),
  ]);
  return (data ?? []).map((row) => mapRow(row as DbGame, genreMap));
}

export async function fetchGameById(
  id: number
): Promise<{ game: Game | null; bggRank: number }> {
  const [genreMap, { data }] = await Promise.all([
    buildGenreMap(),
    supabaseAdmin.from("T_GAME").select(GAME_SELECT).eq("id", id).single(),
  ]);
  if (!data) return { game: null, bggRank: 0 };
  const row = data as DbGame;
  return { game: mapRow(row, genreMap), bggRank: row.bgg_rank ?? 0 };
}
