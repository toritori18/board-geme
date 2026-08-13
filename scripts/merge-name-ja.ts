// data/batch-results.json を、以下3つのソースから再構築する。
//   1. 既存の data/batch-results.json（1回目バッチ。name_ja と short_description_ja の両方を持つ）
//   2. data/mechanics-translations_sample.json（2回目バッチの生ダンプ。short_description_ja のみ）
//   3. data/name-ja/result_*.tsv（claude.ai で作成した name_ja。extract-name-ja.tsが対象を
//      抽出し、verify-name-ja.tsで検算した結果）
// 既存の short_description_ja は絶対に空文字で上書きしない（2回目バッチ由来の説明文が
// 消えるとDBのデータが失われるため）。マージ前に verify-name-ja.ts と同じチェックを行い、
// result_*.tsv と names_*.tsv が食い違っている場合はマージせず終了する。Anthropic API は使わない。
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseCSV } from "./lib/csv.ts";
import { checkNameJaFiles, listNamesFiles } from "./lib/name-ja-check.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

type DescriptionResult = { name_ja: string; short_description_ja: string };

// data/mechanics-translations_sample.json の要素の型（Batch APIの結果の生ダンプ）。
// 使うフィールドのみを最小限に定義する。
type SecondBatchItem = {
  custom_id: string;
  result: {
    type: string;
    message?: { content: { type: string; text?: string }[] };
  };
};

const JAPANESE_RE = /[ぁ-んァ-ヶ一-龠]/;

function parseIntOrNull(value: string): number | null {
  const n = parseInt(value, 10);
  return isNaN(n) ? null : n;
}

// data/mechanics-translations_sample.json から short_description_ja だけを取り出す。
// scripts/collect-batch.ts の collectDescriptions() と同じ要領で本文からJSONを抽出する。
function loadSecondBatchDescriptions(filePath: string): Record<string, string> {
  const items = JSON.parse(fs.readFileSync(filePath, "utf-8")) as SecondBatchItem[];
  const map: Record<string, string> = {};
  let failed = 0;

  for (const item of items) {
    if (item.result.type !== "succeeded") {
      failed++;
      continue;
    }
    const content = item.result.message?.content[0];
    if (!content || content.type !== "text" || !content.text) {
      failed++;
      continue;
    }

    try {
      const jsonMatch = content.text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("JSON not found");
      const parsed = JSON.parse(jsonMatch[0]) as { short_description_ja?: string };
      if (!parsed.short_description_ja) {
        failed++;
        continue;
      }
      map[item.custom_id.replace("game-", "")] = parsed.short_description_ja;
    } catch {
      failed++;
    }
  }

  console.log(`  2回目バッチ: ${Object.keys(map).length}件（失敗 ${failed}件）`);
  return map;
}

// data/name-ja/result_*.tsv から name_ja を読み込む。空の翻訳（verify-name-ja.tsが警告する
// 行）はフォールバック（既存の name_ja またはCSVの英語名）に任せるため取り込まない。
function loadNameJaResults(dir: string): Record<string, string> {
  const map: Record<string, string> = {};
  const files = fs
    .readdirSync(dir)
    .filter((f) => /^result_\d+\.tsv$/.test(f))
    .sort();

  for (const file of files) {
    const content = fs.readFileSync(path.join(dir, file), "utf-8");
    const lines = content.split(/\r\n|\n/).filter((line) => line !== "");
    for (const line of lines) {
      const [id, nameJa] = line.split("\t");
      if (id && nameJa) map[id] = nameJa;
    }
  }

  console.log(`  data/name-ja/result_*.tsv: ${Object.keys(map).length}件（${files.length}ファイル）`);
  return map;
}

function main() {
  const csvPath = path.join(__dirname, "../data/bgg_dataset.csv");
  const batchPath = path.join(__dirname, "../data/batch-results.json");
  const secondBatchPath = path.join(__dirname, "../data/mechanics-translations_sample.json");
  const nameJaDir = path.join(__dirname, "../data/name-ja");

  console.log("マージ前チェック中...");
  const namesFiles = listNamesFiles(nameJaDir);
  if (namesFiles.length === 0) {
    console.error("data/name-ja/names_*.tsv が見つかりません。先に npm run seed:extract-name-ja を実行してください。");
    process.exit(1);
  }

  const checks = checkNameJaFiles(nameJaDir);
  const mismatches = checks.filter((c) => c.status === "mismatch");
  if (mismatches.length > 0) {
    console.error("result_*.tsv と names_*.tsv が食い違っています。マージを中止します。");
    for (const c of mismatches) {
      console.error(`[不一致] ${c.resultFile}`);
      for (const e of c.errors) console.error(`  - ${e}`);
    }
    console.error("\nnpm run seed:verify-name-ja で詳細を確認し、修正してから再実行してください。");
    process.exit(1);
  }

  const readyCount = checks.filter((c) => c.status === "ok").length;
  console.log(`  result_*.tsv: ${readyCount}/${checks.length} ファイル検証済み（残りは未着手）`);

  console.log("ファイル読み込み中...");
  const games = parseCSV(csvPath);
  const existing = JSON.parse(fs.readFileSync(batchPath, "utf-8")) as Record<string, DescriptionResult>;
  const secondBatchDescriptions = loadSecondBatchDescriptions(secondBatchPath);
  const nameJaResults = loadNameJaResults(nameJaDir);

  const merged: Record<string, DescriptionResult> = {};
  for (const g of games) {
    // ID が数値にならない行（現状16件）はT_GAMEに投入されないためマージ対象からも除く。
    if (parseIntOrNull(g["ID"]) === null) continue;

    const id = g["ID"];
    const prev = existing[id];

    const name_ja = nameJaResults[id] || prev?.name_ja || g["Name"];
    // 既存の説明文を最優先する（絶対に空文字で上書きしない）。無ければ2回目バッチ、
    // それも無ければ空文字。
    const short_description_ja = prev?.short_description_ja || secondBatchDescriptions[id] || "";

    merged[id] = { name_ja, short_description_ja };
  }

  const backupPath = `${batchPath}.bak`;
  fs.copyFileSync(batchPath, backupPath);
  console.log(`既存ファイルを ${backupPath} にバックアップしました。`);

  fs.writeFileSync(batchPath, JSON.stringify(merged, null, 2), "utf-8");

  const entries = Object.values(merged);
  const notJapanese = entries.filter((e) => !JAPANESE_RE.test(e.name_ja)).length;
  const emptyDescription = entries.filter((e) => !e.short_description_ja).length;

  console.log(`\nマージ完了: ${entries.length}件`);
  console.log(`  name_ja に日本語が無い: ${notJapanese}件`);
  console.log(`  short_description_ja が空: ${emptyDescription}件`);
}

main();
