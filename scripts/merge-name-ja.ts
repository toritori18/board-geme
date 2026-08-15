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
import {
  checkNameJaFiles,
  diagnoseNoNamesFiles,
  JAPANESE_RE,
  listNamesFiles,
  listOrphanResultFiles,
} from "./lib/name-ja-check.ts";
import { parseIntOrNull } from "./lib/parse.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// name_ja_translated: name_ja が data/name-ja/result_*.tsv 由来（＝claude.ai での翻訳工程を
// 通った）ことを表すフラグ。K2 / Q.E. / 1817 のようにラテン文字表記が正式名称のタイトルは
// 翻訳しても JAPANESE_RE にマッチしないため、日本語文字の有無だけでは翻訳済みか判定できない。
type DescriptionResult = { name_ja: string; short_description_ja: string; name_ja_translated?: boolean };

// data/mechanics-translations_sample.json の要素の型（Batch APIの結果の生ダンプ）。
// 使うフィールドのみを最小限に定義する。
type SecondBatchItem = {
  custom_id: string;
  result: {
    type: string;
    message?: { content: { type: string; text?: string }[] };
  };
};

// バックアップファイル名用のタイムスタンプ（YYYYMMDD-HHMMSS）を生成する。
// Date#toISOString() は ":" を含みWindowsのファイル名に使えないため、手組みで整形する。
function formatTimestamp(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const y = date.getFullYear();
  const mo = pad(date.getMonth() + 1);
  const d = pad(date.getDate());
  const h = pad(date.getHours());
  const mi = pad(date.getMinutes());
  const s = pad(date.getSeconds());
  return `${y}${mo}${d}-${h}${mi}${s}`;
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
    // names_*.tsv が0本の原因は一様ではない（diagnoseNoNamesFiles のコメント参照）。
    // 「extract-name-ja.ts を実行してください」は未着手のとき以外は誤案内になるため、
    // 原因ごとにメッセージを出し分ける。
    const diagnosis = diagnoseNoNamesFiles(nameJaDir);
    if (diagnosis.reason === "no-dir") {
      console.error("data/name-ja がありません。先に npm run seed:extract-name-ja を実行してください。");
    } else if (diagnosis.reason === "not-started") {
      console.error("data/name-ja/names_*.tsv が見つかりません。先に npm run seed:extract-name-ja を実行してください。");
    } else {
      console.error(
        `data/name-ja/names_*.tsv が見つかりませんが、result_*.tsv が ${diagnosis.orphanFiles.length}ファイル残っています。`
      );
      console.error(
        "npm run seed:extract-name-ja が抽出対象0件（＝全ゲームが翻訳済み）で終了し、" +
          "names_*.tsv を1本も生成しなかった状態と考えられます。"
      );
      console.error(
        "names_*.tsv が無いと result_*.tsv と突き合わせて検証できないため、マージは行わずに中止します。"
      );
      console.error(
        "翻訳内容が既に data/batch-results.json に取り込まれていれば、この状態のままで問題ありません。"
      );
      console.error(
        "npm run seed:extract-name-ja を再実行しても抽出対象は再び0件になるため、状況は変わりません。"
      );
    }
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

  // 対応する names_*.tsv が無い result_*.tsv（孤立ファイル）は checkNameJaFiles の走査対象外
  // で一度も検証されない。extract-name-ja.ts の再実行で対象件数が変わり names_*.tsv の本数が
  // 減ると発生しうるため、未検証のままマージしないよう別途検出して止める。
  const orphanFiles = listOrphanResultFiles(nameJaDir);
  if (orphanFiles.length > 0) {
    console.error("対応する names_*.tsv が無い result_*.tsv があります。マージを中止します。");
    for (const f of orphanFiles) console.error(`[孤立] ${f}`);
    console.error(
      "\nnpm run seed:extract-name-ja の再実行で対象が変わった可能性があります。" +
        "不要なら削除、必要なら names 側と対応を取り直してください。"
    );
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

    // 今回 result_*.tsv から取り込んだ、または既存データが既にフラグ済みならフラグを立てる。
    // result_*.tsv は検証後に削除されうるため、既存値を引き継がないとフラグが消えてしまう。
    const name_ja_translated = nameJaResults[id] !== undefined || prev?.name_ja_translated === true;

    // false の場合はキーを持たせない（batch-results.jsonは全件で5MBあり、無駄なキーを
    // 増やしたくないため）。DescriptionResultのname_ja_translatedはoptionalなので省略可能。
    merged[id] = name_ja_translated
      ? { name_ja, short_description_ja, name_ja_translated }
      : { name_ja, short_description_ja };
  }

  const backupPath = `${batchPath}.${formatTimestamp(new Date())}.bak`;
  fs.copyFileSync(batchPath, backupPath);
  console.log(`既存ファイルを ${backupPath} にバックアップしました。`);

  fs.writeFileSync(batchPath, JSON.stringify(merged, null, 2), "utf-8");

  const entries = Object.values(merged);
  // 真に未訳（name_ja_translatedが立っておらず、日本語文字も含まない）件数のみを集計する。
  // K2 / Q.E. のようにラテン文字表記が正式名称のタイトルはフラグで翻訳済みと判定されるため、
  // JAPANESE_RE 単独の集計より実態に近い。
  const untranslated = entries.filter((e) => e.name_ja_translated !== true && !JAPANESE_RE.test(e.name_ja)).length;
  const emptyDescription = entries.filter((e) => !e.short_description_ja).length;

  console.log(`\nマージ完了: ${entries.length}件`);
  console.log(`  name_ja が未訳（フラグなし・日本語文字なし）: ${untranslated}件`);
  console.log(`  short_description_ja が空: ${emptyDescription}件`);
}

main();
