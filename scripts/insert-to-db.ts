import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

type GameRecord = Record<string, string>;
type DescriptionResult = { name_ja: string; short_description_ja: string };

function parseCSV(filePath: string): GameRecord[] {
  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.split("\n").filter((line) => line.trim());
  const headers = lines[0].split(";").map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const values = line.split(";");
    return Object.fromEntries(headers.map((h, i) => [h, (values[i] ?? "").trim()]));
  });
}

function parseNumber(value: string): number | null {
  const n = parseFloat(value.replace(",", "."));
  return isNaN(n) ? null : n;
}

function parseIntOrNull(value: string): number | null {
  const n = parseInt(value);
  return isNaN(n) ? null : n;
}

// Mechanics を M_GAME_KIND に挿入
async function insertGameKind(
  games: GameRecord[],
  translationMap: Record<string, string>
): Promise<Record<string, number>> {
  const allMechanics = [
    ...new Set(
      games.flatMap((g) =>
        g["Mechanics"] ? g["Mechanics"].split(",").map((m) => m.trim()).filter(Boolean) : []
      )
    ),
  ].sort();

  console.log(`M_GAME_KINDに挿入中... (${allMechanics.length}件)`);
  const rows = allMechanics.map((mechanic) => ({
    game_kind_name: mechanic,
    game_kind_name_ja: translationMap[mechanic] ?? mechanic,
  }));

  const { data, error } = await supabase
    .from("M_GAME_KIND")
    .upsert(rows, { onConflict: "game_kind_name" })
    .select("id, game_kind_name");

  if (error) throw error;
  return Object.fromEntries((data ?? []).map((d) => [d.game_kind_name, d.id]));
}

// Domains を M_GAME_GENRE に挿入（game_kind_name_ja は後から投入のため NULL）
async function insertGameGenre(games: GameRecord[]): Promise<Record<string, number>> {
  const allDomains = [
    ...new Set(
      games.flatMap((g) =>
        g["Domains"] ? g["Domains"].split(",").map((d) => d.trim()).filter(Boolean) : []
      )
    ),
  ];

  console.log(`M_GAME_GENREに挿入中... (${allDomains.length}件)`);
  const { data, error } = await supabase
    .from("M_GAME_GENRE")
    .upsert(allDomains.map((domain) => ({ game_genre_name: domain })), { onConflict: "game_genre_name" })
    .select("id, game_genre_name");

  if (error) throw error;
  return Object.fromEntries((data ?? []).map((d) => [d.game_genre_name, d.id]));
}

// T_GAME にゲームデータを挿入
async function insertGames(
  games: GameRecord[],
  descriptionMap: Record<string, DescriptionResult>,
  kindIdMap: Record<string, number>,
  genreIdMap: Record<string, number>
) {
  const CHUNK = 500;
  let inserted = 0;
  console.log(`\nT_GAMEに挿入中... (${games.length}件)`);

  for (let i = 0; i < games.length; i += CHUNK) {
    const chunk = games.slice(i, i + CHUNK);

    const validChunk = chunk.filter((g) => parseIntOrNull(g["ID"]) !== null);
    const rows = validChunk.map((g) => {
      const desc = descriptionMap[g["ID"]] ?? { name_ja: g["Name"], short_description_ja: "" };

      const mechanics = g["Mechanics"]
        ? g["Mechanics"].split(",").map((m) => m.trim()).filter(Boolean)
        : [];
      const typeIds = mechanics.map((m) => kindIdMap[m]).filter((id): id is number => id != null);

      const domains = g["Domains"]
        ? g["Domains"].split(",").map((d) => d.trim()).filter(Boolean)
        : [];
      const domainIds = domains.map((d) => genreIdMap[d]).filter((id): id is number => id != null);

      return {
        id: parseIntOrNull(g["ID"]),
        game_name: g["Name"],
        game_name_ja: desc.name_ja,
        year_published: parseIntOrNull(g["Year Published"]),
        min_players: parseIntOrNull(g["Min Players"]),
        max_players: parseIntOrNull(g["Max Players"]),
        play_time: parseIntOrNull(g["Play Time"]),
        min_age: parseIntOrNull(g["Min Age"]),
        users_rated: parseIntOrNull(g["Users Rated"]),
        rating_average: parseNumber(g["Rating Average"]),
        bgg_rank: parseIntOrNull(g["BGG Rank"]),
        complexity_average: parseNumber(g["Complexity Average"]),
        description_ja: desc.short_description_ja,
        short_description_ja: desc.short_description_ja,
        game_type_id: typeIds.length > 0 ? typeIds : null,
        game_domain_id: domainIds.length > 0 ? domainIds : null,
      };
    });

    const { error } = await supabase.from("T_GAME").upsert(rows);
    if (error) {
      console.error(`  チャンク ${i}〜${i + CHUNK} でエラー:`, error.message);
    } else {
      inserted += validChunk.length;
      process.stdout.write(`\r  ${inserted}/${games.length} 件完了`);
    }
  }

  console.log("\n");
}

async function main() {
  const batchResultsPath = path.join(__dirname, "../data/batch-results.json");
  const translationsPath = path.join(__dirname, "../data/mechanics-translations.json");

  if (!fs.existsSync(batchResultsPath)) {
    console.error("data/batch-results.json が見つかりません。先に collect-batch.ts を実行してください。");
    process.exit(1);
  }
  if (!fs.existsSync(translationsPath)) {
    console.error("data/mechanics-translations.json が見つかりません。先に collect-batch.ts を実行してください。");
    process.exit(1);
  }

  const descriptionMap = JSON.parse(fs.readFileSync(batchResultsPath, "utf-8")) as Record<string, DescriptionResult>;
  const translationMap = JSON.parse(fs.readFileSync(translationsPath, "utf-8")) as Record<string, string>;

  console.log(`説明文: ${Object.keys(descriptionMap).length}件`);
  console.log(`Mechanics翻訳: ${Object.keys(translationMap).length}件`);

  const csvPath = path.join(__dirname, "../data/bgg_dataset.csv");
  const games = parseCSV(csvPath);

  const allMechanics = [...new Set(games.flatMap((g) =>
    g["Mechanics"] ? g["Mechanics"].split(",").map((m) => m.trim()).filter(Boolean) : []
  ))].sort();
  const kindIdMap: Record<string, number> = Object.fromEntries(allMechanics.map((m, i) => [m, i + 1]));

  const allDomains = [...new Set(games.flatMap((g) =>
    g["Domains"] ? g["Domains"].split(",").map((d) => d.trim()).filter(Boolean) : []
  ))].sort();
  const genreIdMap: Record<string, number> = Object.fromEntries(allDomains.map((d, i) => [d, i + 1]));

  await insertGames(games, descriptionMap, kindIdMap, genreIdMap);

  console.log("データ投入完了！");
}

main().catch(console.error);
