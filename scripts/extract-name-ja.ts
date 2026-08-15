// data/bgg_dataset.csv と data/batch-results.json を突き合わせ、game_name_ja の翻訳が
// 必要なゲーム（未登録、または登録済みだが英語名のまま）だけを抽出し、claude.ai に
// 貼り付ける用の TSV（ID・英語名・出版年）に分割出力する。Anthropic API は使わない。
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseCSV } from "./lib/csv.ts";
import { JAPANESE_RE } from "./lib/name-ja-check.ts";
import { parseIntOrNull } from "./lib/parse.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// name_ja_translated: name_ja が data/name-ja/result_*.tsv 由来（＝claude.ai での翻訳工程を
// 通った）ことを表すフラグ。K2 / Q.E. / 1817 のようにラテン文字表記が正式名称のタイトルは
// 翻訳しても JAPANESE_RE にマッチしないため、日本語文字の有無だけでは翻訳済みか判定できない。
type DescriptionResult = { name_ja: string; short_description_ja: string; name_ja_translated?: boolean };

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
    // name_ja_translated フラグを優先し、無い場合（1回目バッチ由来でフラグが付いていない
    // 既存データ）は後方互換として JAPANESE_RE のフォールバック判定を使う。
    const alreadyTranslated =
      existing !== undefined && (existing.name_ja_translated === true || JAPANESE_RE.test(existing.name_ja));
    if (alreadyTranslated) continue;

    targets.push({ id: g["ID"], name: g["Name"], year: formatYear(g["Year Published"]) });
  }

  // data/name-ja/names_*.tsv を作り直す前に既存分を削除する。CSV + batch-results.json
  // という権威あるソースから毎回作り直す方針のため、古い分割結果を残さない（names_*.tsv は
  // このスクリプトが再生成できるため削除して問題ない）。
  // result_*.tsv（claude.aiから手作業で回収した翻訳）は削除対象に含めない。data/ は
  // .gitignore 対象でgit履歴からも戻せず、スクリプトでの再生成もできない手作業の成果物
  // であり、誤って削除すると復元不能になるため。
  const namesFileRe = /^names_\d+\.tsv$/;
  if (fs.existsSync(outDir)) {
    const existingFiles = fs.readdirSync(outDir);
    for (const file of existingFiles) {
      if (namesFileRe.test(file)) fs.unlinkSync(path.join(outDir, file));
    }
    const keptResultCount = existingFiles.filter((f) => /^result_\d+\.tsv$/.test(f)).length;
    if (keptResultCount > 0) {
      console.log(`既存の result_*.tsv ${keptResultCount}ファイルは保持しました。`);
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
