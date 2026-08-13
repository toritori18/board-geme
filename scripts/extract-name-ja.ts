// data/bgg_dataset.csv と data/batch-results.json を突き合わせ、game_name_ja の翻訳が
// 必要なゲーム（未登録、または登録済みだが英語名のまま）だけを抽出し、claude.ai に
// 貼り付ける用の TSV（ID・英語名・出版年）に分割出力する。Anthropic API は使わない。
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseCSV } from "./lib/csv.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

type DescriptionResult = { name_ja: string; short_description_ja: string };

// ひらがな・カタカナ・漢字のいずれかを含むかで日本語訳済みと判定する。
// docs/sql/insert_transaction_data.sql 反映後の検証クエリ（ぁ-んァ-ヶ一-龠）と同じ範囲。
const JAPANESE_RE = /[ぁ-んァ-ヶ一-龠]/;

function parseIntOrNull(value: string): number | null {
  const n = parseInt(value, 10);
  return isNaN(n) ? null : n;
}

// 出版年を出力用の文字列に変換する。0年出版のゲームは存在しないため「不明」として空文字にする。
function formatYear(value: string): string {
  const n = parseIntOrNull(value);
  if (n === null || n === 0) return "";
  return String(n);
}

function main() {
  const csvPath = path.join(__dirname, "../data/bgg_dataset.csv");
  const batchPath = path.join(__dirname, "../data/batch-results.json");
  const outDir = path.join(__dirname, "../data/name-ja");

  console.log("ファイル読み込み中...");
  const games = parseCSV(csvPath);
  const batchResults = JSON.parse(fs.readFileSync(batchPath, "utf-8")) as Record<string, DescriptionResult>;

  const targets: { id: string; name: string; year: string }[] = [];
  for (const g of games) {
    // ID が数値にならない行（現状16件）はT_GAMEに投入されないため翻訳対象からも除く。
    if (parseIntOrNull(g["ID"]) === null) continue;

    const existing = batchResults[g["ID"]];
    const alreadyTranslated = existing !== undefined && JAPANESE_RE.test(existing.name_ja);
    if (alreadyTranslated) continue;

    targets.push({ id: g["ID"], name: g["Name"], year: formatYear(g["Year Published"]) });
  }

  // data/name-ja/*.tsv を作り直す前に既存分を削除する。CSV + batch-results.json という
  // 権威あるソースから毎回作り直す方針のため、古い分割結果を残さない。
  // 注意: names_*.tsv だけでなく result_*.tsv（claude.aiからの受領済み翻訳）も対象になる。
  // PROMPT.md は拡張子が .md のためこの削除の対象外。
  if (fs.existsSync(outDir)) {
    for (const file of fs.readdirSync(outDir)) {
      if (file.endsWith(".tsv")) fs.unlinkSync(path.join(outDir, file));
    }
  } else {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const CHUNK = 500;
  let fileCount = 0;
  let totalSize = 0;
  for (let i = 0; i < targets.length; i += CHUNK) {
    fileCount++;
    const chunk = targets.slice(i, i + CHUNK);
    const body = chunk.map((t) => `${t.id}\t${t.name}\t${t.year}`).join("\n") + "\n";
    const fileName = `names_${String(fileCount).padStart(2, "0")}.tsv`;
    fs.writeFileSync(path.join(outDir, fileName), body, "utf-8");
    totalSize += Buffer.byteLength(body, "utf-8");
  }

  console.log(`翻訳対象: ${targets.length}件`);
  console.log(`出力ファイル数: ${fileCount}`);
  console.log(`合計サイズ: ${(totalSize / 1024).toFixed(1)} KB`);
  console.log(`出力先: ${outDir}`);
}

main();
