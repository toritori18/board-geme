import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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

function parseNum(value: string): number | null {
  const n = parseFloat(value.replace(",", "."));
  return isNaN(n) ? null : n;
}

function parseInt2(value: string): number | null {
  const n = parseInt(value, 10);
  return isNaN(n) ? null : n;
}

function lit(value: string | number | null): string {
  if (value === null) return "NULL";
  if (typeof value === "number") return value.toString();
  return `'${value.replace(/'/g, "''")}'`;
}

function arrLit(ids: number[]): string {
  return ids.length > 0 ? `ARRAY[${ids.join(",")}]` : "NULL";
}

function splitList(raw: string): string[] {
  return raw ? raw.split(",").map((s) => s.trim()).filter(Boolean) : [];
}

function main() {
  const csvPath = path.join(__dirname, "../data/bgg_dataset.csv");
  const batchPath = path.join(__dirname, "../data/batch-results.json");
  const transPath = path.join(__dirname, "../data/mechanics-translations.json");
  const outPath = path.join(__dirname, "../docs/sql/insert_game_data.sql");

  console.log("ファイル読み込み中...");
  const games = parseCSV(csvPath);
  const descMap = JSON.parse(fs.readFileSync(batchPath, "utf-8")) as Record<string, DescriptionResult>;
  const transMap = JSON.parse(fs.readFileSync(transPath, "utf-8")) as Record<string, string>;

  // メカニクス（ソート済み）→ ID割り当て
  const mechanicsSet = new Set<string>();
  for (const g of games) splitList(g["Mechanics"]).forEach((m) => mechanicsSet.add(m));
  const mechanics = [...mechanicsSet].sort();
  const mechanicsId: Record<string, number> = Object.fromEntries(mechanics.map((m, i) => [m, i + 1]));

  // ドメイン → ID割り当て
  const domainsSet = new Set<string>();
  for (const g of games) splitList(g["Domains"]).forEach((d) => domainsSet.add(d));
  const domains = [...domainsSet].sort();
  const domainsId: Record<string, number> = Object.fromEntries(domains.map((d, i) => [d, i + 1]));

  const out: string[] = [];
  out.push("-- INSERT SQL generated from CSV/JSON data");
  out.push(`-- Generated: ${new Date().toISOString()}`);
  out.push("-- Source: data/bgg_dataset.csv + data/batch-results.json + data/mechanics-translations.json");
  out.push("");

  // ----------------------------------------------------------------
  // M_GAME_KIND
  // ----------------------------------------------------------------
  out.push("-- ============================================================");
  out.push("-- M_GAME_KIND: ゲームメカニクスマスタ");
  out.push("-- ============================================================");

  const CHUNK_KIND = 200;
  for (let i = 0; i < mechanics.length; i += CHUNK_KIND) {
    const chunk = mechanics.slice(i, i + CHUNK_KIND);
    out.push(`INSERT INTO public."M_GAME_KIND" (id, game_kind_name, game_kind_name_ja) VALUES`);
    chunk.forEach((m, j) => {
      const id = mechanicsId[m];
      const ja = transMap[m] ?? m;
      const sep = j < chunk.length - 1 ? "," : "";
      out.push(`  (${id}, ${lit(m)}, ${lit(ja)})${sep}`);
    });
    out.push(`ON CONFLICT (game_kind_name) DO UPDATE SET game_kind_name_ja = EXCLUDED.game_kind_name_ja;`);
    out.push("");
  }
  out.push(`SELECT setval(pg_get_serial_sequence('"M_GAME_KIND"', 'id'), ${mechanics.length});`);
  out.push("");

  // ----------------------------------------------------------------
  // M_GAME_GENRE
  // ----------------------------------------------------------------
  out.push("-- ============================================================");
  out.push("-- M_GAME_GENRE: ゲームジャンルマスタ");
  out.push("-- ============================================================");

  const CHUNK_GENRE = 200;
  for (let i = 0; i < domains.length; i += CHUNK_GENRE) {
    const chunk = domains.slice(i, i + CHUNK_GENRE);
    out.push(`INSERT INTO public."M_GAME_GENRE" (id, game_genre_name) VALUES`);
    chunk.forEach((d, j) => {
      const id = domainsId[d];
      const sep = j < chunk.length - 1 ? "," : "";
      out.push(`  (${id}, ${lit(d)})${sep}`);
    });
    out.push(`ON CONFLICT (game_genre_name) DO NOTHING;`);
    out.push("");
  }
  out.push(`SELECT setval(pg_get_serial_sequence('"M_GAME_GENRE"', 'id'), ${domains.length});`);
  out.push("");

  // ----------------------------------------------------------------
  // T_GAME
  // ----------------------------------------------------------------
  out.push("-- ============================================================");
  out.push("-- T_GAME: ゲームデータ");
  out.push("-- ============================================================");

  const CHUNK_GAME = 500;
  for (let i = 0; i < games.length; i += CHUNK_GAME) {
    const chunk = games.slice(i, i + CHUNK_GAME);
    out.push(
      `INSERT INTO public."T_GAME" ` +
      `(id, game_name, game_name_ja, year_published, min_players, max_players, ` +
      `play_time, min_age, users_rated, rating_average, bgg_rank, complexity_average, ` +
      `description_ja, short_description_ja, game_type_id, game_domain_id) VALUES`
    );

    chunk.forEach((g, j) => {
      const desc = descMap[g["ID"]] ?? { name_ja: g["Name"], short_description_ja: "" };
      const typeIds = splitList(g["Mechanics"]).map((m) => mechanicsId[m]).filter((id): id is number => id != null);
      const domIds = splitList(g["Domains"]).map((d) => domainsId[d]).filter((id): id is number => id != null);

      const sep = j < chunk.length - 1 ? "," : "";
      out.push(
        `  (` +
        `${lit(parseInt2(g["ID"]))}, ` +
        `${lit(g["Name"])}, ` +
        `${lit(desc.name_ja)}, ` +
        `${lit(parseInt2(g["Year Published"]))}, ` +
        `${lit(parseInt2(g["Min Players"]))}, ` +
        `${lit(parseInt2(g["Max Players"]))}, ` +
        `${lit(parseInt2(g["Play Time"]))}, ` +
        `${lit(parseInt2(g["Min Age"]))}, ` +
        `${lit(parseInt2(g["Users Rated"]))}, ` +
        `${lit(parseNum(g["Rating Average"]))}, ` +
        `${lit(parseInt2(g["BGG Rank"]))}, ` +
        `${lit(parseNum(g["Complexity Average"]))}, ` +
        `${lit(desc.short_description_ja)}, ` +
        `${lit(desc.short_description_ja)}, ` +
        `${arrLit(typeIds)}, ` +
        `${arrLit(domIds)}` +
        `)${sep}`
      );
    });

    out.push(`ON CONFLICT (id) DO NOTHING;`);
    out.push("");
  }

  fs.writeFileSync(outPath, out.join("\n"), "utf-8");

  const stat = fs.statSync(outPath);
  const sizeMb = (stat.size / 1024 / 1024).toFixed(1);
  console.log(`✓ SQL生成完了: ${outPath}`);
  console.log(`  M_GAME_KIND : ${mechanics.length} 件`);
  console.log(`  M_GAME_GENRE: ${domains.length} 件`);
  console.log(`  T_GAME      : ${games.length} 件`);
  console.log(`  ファイルサイズ: ${sizeMb} MB`);
}

main();
