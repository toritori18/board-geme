import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseCSV, type GameRecord } from "./lib/csv.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

type DescriptionResult = { name_ja: string; short_description_ja: string };

function parseNumber(value: string): number | null {
  // replace(",", ".") だと最初の1個しか置換されないため、桁区切りの "," が
  // 複数含まれる値（例: "1,234.5" 相当の表記揺れ）で2個目以降が残ってしまう。
  // replaceAll() で全て置換する。
  const n = parseFloat(value.replaceAll(",", "."));
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
  const allMechanics = Array.from(
    new Set(
      games.flatMap((g) =>
        g["Mechanics"] ? g["Mechanics"].split(",").map((m) => m.trim()).filter(Boolean) : []
      )
    )
  ).sort();

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
  const allDomains = Array.from(
    new Set(
      games.flatMap((g) =>
        g["Domains"] ? g["Domains"].split(",").map((d) => d.trim()).filter(Boolean) : []
      )
    )
    // insertGameKind() と揃えてソートする。再実行時にupsertの入力順が変わらなくなり、
    // 差分（ログ出力・投入順）が読みやすくなるため。
  ).sort();

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
): Promise<{ inserted: number; failedChunks: number }> {
  const CHUNK = 500;
  let inserted = 0;
  let failedChunks = 0;
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
        // 長文説明は未生成のため NULL を入れる。短文の複製を入れると詳細ページの
        // 「ゲーム紹介」が一覧カードと同じ文になる（レビューの M-7）。
        description_ja: null,
        short_description_ja: desc.short_description_ja,
        game_type_id: typeIds.length > 0 ? typeIds : null,
        game_domain_id: domainIds.length > 0 ? domainIds : null,
      };
    });

    const { error } = await supabase.from("T_GAME").upsert(rows);
    if (error) {
      console.error(`  チャンク ${i}〜${i + CHUNK} でエラー:`, error.message);
      failedChunks++;
    } else {
      inserted += validChunk.length;
      process.stdout.write(`\r  ${inserted}/${games.length} 件完了`);
    }
  }

  console.log("\n");

  return { inserted, failedChunks };
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

  // マスタを先に投入し、DB が採番した実 ID を受け取る。ローカルで i+1 を振ると
  // SERIAL と一致する保証が無く、ジャンルタグが全件ずれる（レビューの M-8）。
  const kindIdMap = await insertGameKind(games, translationMap);
  const genreIdMap = await insertGameGenre(games);

  const { failedChunks } = await insertGames(games, descriptionMap, kindIdMap, genreIdMap);

  if (failedChunks > 0) {
    console.error(`\n${failedChunks} 個のチャンクが失敗しました。投入は不完全です。`);
    process.exit(1);
  }

  console.log("データ投入完了！");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
