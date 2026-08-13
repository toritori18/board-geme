// 前提: 出力する2ファイルは再投入可否が異なる。
//
// docs/sql/insert_master_data.sql（M_GAME_KIND / M_GAME_GENRE）は
// 「空のマスタに対して1回だけ流す」初回投入専用のままである。M_GAME_KIND.id /
// M_GAME_GENRE.id をDBに採番させず、CSVから読んだメカニクス・ドメインの一覧をソートして
// ローカルで `i + 1` を振っている（下記 mechanicsId / domainsId）。マスタに既存行がある
// 状態でこのSQLを流すと、ここで振ったローカルのIDと実際のDB上のIDがずれ、
// T_GAME.game_domain_id / game_type_id が指す先を誤り、ジャンルタグが全件ずれる。
// 同じ問題は scripts/insert-to-db.ts（`npm run seed:insert`）では、マスタをupsertした後に
// `.select("id, ...")` でDB採番済みの実IDを読み戻す方式（insertGameKind() /
// insertGameGenre()）で解決済み。既存データへの追加投入には常にそちらを使うこと。
// 本スクリプトはそのDB採番読み戻し方式への全面書き換えはせず、代わりに
// insert_master_data.sql の先頭にマスタが空であることを実行時に検証するガード
// （下記 DO $$ ブロック）を出力する。
//
// docs/sql/insert_transaction_data.sql（T_GAME）は既存DBへの再投入が可能である。既存行は
// `ON CONFLICT (id) DO UPDATE` で game_name_ja / short_description_ja のみを更新し、
// game_type_id / game_domain_id を含む他のカラムには触れない。そのため上記のローカルID
// 採番とDB採番のずれは、既存行の更新パス（＝現状ほぼ全件）では問題にならない。ただし、
// CSVには存在するがDBに未投入の新規行がある場合、その行はINSERT経路を通り
// game_type_id / game_domain_id にローカル採番のIDがそのまま入るため、マスタの状態次第
// では誤ったジャンルタグになりうる。既存DBに対して流す前提（マスタは投入済み）の用途では
// 通常発生しないが、新規ゲームの追加投入には npm run seed:insert を使うこと。
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseCSV } from "./lib/csv.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

type DescriptionResult = { name_ja: string; short_description_ja: string };

function parseNum(value: string): number | null {
  // replace(",", ".") だと最初の1個しか置換されないため、"," が複数含まれる値で
  // 2個目以降が残ってしまう（scripts/insert-to-db.ts の parseNumber() と同じ問題）。
  // replaceAll() で全て置換する。
  const n = parseFloat(value.replaceAll(",", "."));
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
  const masterOutPath = path.join(__dirname, "../docs/sql/insert_master_data.sql");
  const transactionOutPath = path.join(__dirname, "../docs/sql/insert_transaction_data.sql");

  console.log("ファイル読み込み中...");
  const games = parseCSV(csvPath);
  const descMap = JSON.parse(fs.readFileSync(batchPath, "utf-8")) as Record<string, DescriptionResult>;
  const transMap = JSON.parse(fs.readFileSync(transPath, "utf-8")) as Record<string, string>;

  // id が数値にならない行（現状16件）は PRIMARY KEY が NULL になり INSERT できないため
  // T_GAME の出力対象から除外する。scripts/insert-to-db.ts の insertGames() と同じガード。
  const validGames = games.filter((g) => parseInt2(g["ID"]) !== null);

  // メカニクス（ソート済み）→ ID割り当て。マスタの集計は id 列を使わないため、
  // scripts/insert-to-db.ts の insertGameKind() と同様に games 全体（id 無効行も含む）から
  // 集計する。
  const mechanicsSet = new Set<string>();
  for (const g of games) splitList(g["Mechanics"]).forEach((m) => mechanicsSet.add(m));
  const mechanics = Array.from(mechanicsSet).sort();
  const mechanicsId: Record<string, number> = Object.fromEntries(mechanics.map((m, i) => [m, i + 1]));

  // ドメイン → ID割り当て
  const domainsSet = new Set<string>();
  for (const g of games) splitList(g["Domains"]).forEach((d) => domainsSet.add(d));
  const domains = Array.from(domainsSet).sort();
  const domainsId: Record<string, number> = Object.fromEntries(domains.map((d, i) => [d, i + 1]));

  // docs/sql/ はDDLごと.gitignore対象のため、クローン直後は存在しない可能性がある。
  fs.mkdirSync(path.dirname(masterOutPath), { recursive: true });

  // ============================================================
  // insert_master_data.sql: M_GAME_KIND / M_GAME_GENRE（初回投入専用）
  // ============================================================
  const masterOut: string[] = [];
  masterOut.push("-- INSERT SQL generated from CSV/JSON data (マスタ: 空のマスタへの初回投入専用)");
  masterOut.push(`-- Generated: ${new Date().toISOString()}`);
  masterOut.push("-- Source: data/bgg_dataset.csv + data/mechanics-translations.json");
  masterOut.push("");

  // ----------------------------------------------------------------
  // 前提チェック: マスタが空であることを実行時に強制する
  // ローカルで振ったID（mechanicsId / domainsId、ファイル冒頭コメント参照）は、
  // マスタが空である前提でのみDB採番と一致する。既存行があるまま気付かず流すと
  // ジャンルタグが全件ずれるが、それはSQL実行時までエラーにならず発覚しにくいため、
  // INSERT本体より前に空チェックで止める。
  // ----------------------------------------------------------------
  masterOut.push("-- ============================================================");
  masterOut.push("-- 前提チェック: M_GAME_KIND / M_GAME_GENRE が空であることを確認する");
  masterOut.push("-- ============================================================");
  masterOut.push("DO $$");
  masterOut.push("BEGIN");
  masterOut.push(`  IF EXISTS (SELECT 1 FROM public."M_GAME_KIND") OR EXISTS (SELECT 1 FROM public."M_GAME_GENRE") THEN`);
  masterOut.push(
    `    RAISE EXCEPTION 'M_GAME_KIND または M_GAME_GENRE に既存データがあります。このSQLは空のマスタへの初回投入専用です。既存データへの追加投入には npm run seed:insert を使ってください。';`
  );
  masterOut.push("  END IF;");
  masterOut.push("END $$;");
  masterOut.push("");

  // ----------------------------------------------------------------
  // M_GAME_KIND
  // ----------------------------------------------------------------
  masterOut.push("-- ============================================================");
  masterOut.push("-- M_GAME_KIND: ゲームメカニクスマスタ");
  masterOut.push("-- ============================================================");

  const CHUNK_KIND = 200;
  for (let i = 0; i < mechanics.length; i += CHUNK_KIND) {
    const chunk = mechanics.slice(i, i + CHUNK_KIND);
    masterOut.push(`INSERT INTO public."M_GAME_KIND" (id, game_kind_name, game_kind_name_ja) VALUES`);
    chunk.forEach((m, j) => {
      const id = mechanicsId[m];
      const ja = transMap[m] ?? m;
      const sep = j < chunk.length - 1 ? "," : "";
      masterOut.push(`  (${id}, ${lit(m)}, ${lit(ja)})${sep}`);
    });
    masterOut.push(`ON CONFLICT (game_kind_name) DO UPDATE SET game_kind_name_ja = EXCLUDED.game_kind_name_ja;`);
    masterOut.push("");
  }
  // 前提チェックにより実行時点でマスタは空のはずだが、シーケンスの現在値が生成件数より
  // 大きい可能性はゼロではない（例えば手動でシーケンスだけ進めていた場合）。既存の最大IDより
  // 小さい値をsetvalでセットすると、以後の採番がその値から再開して主キー衝突を起こすため、
  // GREATEST()で「現在のMAX(id)」と「今回の生成件数」の大きい方を必ず採用する。
  masterOut.push(
    `SELECT setval(pg_get_serial_sequence('"M_GAME_KIND"', 'id'), GREATEST((SELECT COALESCE(MAX(id), 0) FROM public."M_GAME_KIND"), ${mechanics.length}));`
  );
  masterOut.push("");

  // ----------------------------------------------------------------
  // M_GAME_GENRE
  // ----------------------------------------------------------------
  masterOut.push("-- ============================================================");
  masterOut.push("-- M_GAME_GENRE: ゲームジャンルマスタ");
  masterOut.push("-- ============================================================");

  const CHUNK_GENRE = 200;
  for (let i = 0; i < domains.length; i += CHUNK_GENRE) {
    const chunk = domains.slice(i, i + CHUNK_GENRE);
    masterOut.push(`INSERT INTO public."M_GAME_GENRE" (id, game_genre_name) VALUES`);
    chunk.forEach((d, j) => {
      const id = domainsId[d];
      const sep = j < chunk.length - 1 ? "," : "";
      masterOut.push(`  (${id}, ${lit(d)})${sep}`);
    });
    masterOut.push(`ON CONFLICT (game_genre_name) DO NOTHING;`);
    masterOut.push("");
  }
  // 理由はM_GAME_KINDのsetvalと同じ（既存の最大IDより小さい値をセットすると主キー衝突を起こす）
  masterOut.push(
    `SELECT setval(pg_get_serial_sequence('"M_GAME_GENRE"', 'id'), GREATEST((SELECT COALESCE(MAX(id), 0) FROM public."M_GAME_GENRE"), ${domains.length}));`
  );
  masterOut.push("");

  fs.writeFileSync(masterOutPath, masterOut.join("\n"), "utf-8");

  // ============================================================
  // insert_transaction_data.sql: T_GAME（既存DBへの再投入も可能）
  // ============================================================
  const transactionOut: string[] = [];
  transactionOut.push("-- INSERT SQL generated from CSV/JSON data (T_GAME: 既存DBへの再投入可能)");
  transactionOut.push(`-- Generated: ${new Date().toISOString()}`);
  transactionOut.push("-- Source: data/bgg_dataset.csv + data/batch-results.json + data/mechanics-translations.json");
  transactionOut.push("");
  transactionOut.push("-- ============================================================");
  transactionOut.push("-- T_GAME: ゲームデータ");
  transactionOut.push("-- ============================================================");

  const CHUNK_GAME = 500;
  for (let i = 0; i < validGames.length; i += CHUNK_GAME) {
    const chunk = validGames.slice(i, i + CHUNK_GAME);
    transactionOut.push(
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
      transactionOut.push(
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
        // 長文説明は未生成のため NULL を出力する。短文の複製を出力すると詳細ページの
        // 「ゲーム紹介」が一覧カードと同じ文になる（レビューの M-7）。
        `${lit(null)}, ` +
        `${lit(desc.short_description_ja)}, ` +
        `${arrLit(typeIds)}, ` +
        `${arrLit(domIds)}` +
        `)${sep}`
      );
    });

    // 既存DBにはvalidGamesのほぼ全件が投入済みのため、ほとんどの行はここでUPDATE経路を
    // 通る。game_name_ja / short_description_ja だけを更新し、game_type_id等の他カラムには
    // 触れない（ファイル冒頭コメント参照）。
    transactionOut.push(
      `ON CONFLICT (id) DO UPDATE SET game_name_ja = EXCLUDED.game_name_ja, short_description_ja = EXCLUDED.short_description_ja;`
    );
    transactionOut.push("");
  }

  fs.writeFileSync(transactionOutPath, transactionOut.join("\n"), "utf-8");

  const masterStat = fs.statSync(masterOutPath);
  const transactionStat = fs.statSync(transactionOutPath);
  console.log(`✓ SQL生成完了`);
  console.log(`  ${masterOutPath}`);
  console.log(`    M_GAME_KIND : ${mechanics.length} 件`);
  console.log(`    M_GAME_GENRE: ${domains.length} 件`);
  console.log(`    ファイルサイズ: ${(masterStat.size / 1024 / 1024).toFixed(1)} MB`);
  console.log(`  ${transactionOutPath}`);
  console.log(`    T_GAME      : ${validGames.length} 件（ID無効のため除外: ${games.length - validGames.length} 件）`);
  console.log(`    ファイルサイズ: ${(transactionStat.size / 1024 / 1024).toFixed(1)} MB`);
}

main();
