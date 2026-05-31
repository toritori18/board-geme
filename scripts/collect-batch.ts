import Anthropic from "@anthropic-ai/sdk";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

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

// バッチ結果を収集してdata/batch-results.jsonに保存
async function collectDescriptions(batchIds: string[]): Promise<Record<string, DescriptionResult>> {
  const outputPath = path.join(__dirname, "../data/batch-results.json");

  // 既存のJSONがあればスキップ
  if (fs.existsSync(outputPath)) {
    console.log(`batch-results.json が既に存在します。再利用します。`);
    return JSON.parse(fs.readFileSync(outputPath, "utf-8")) as Record<string, DescriptionResult>;
  }

  const descriptionMap: Record<string, DescriptionResult> = {};

  for (const batchId of batchIds) {
    console.log(`バッチ ${batchId} を確認中...`);
    const batch = await anthropic.messages.batches.retrieve(batchId);

    if (batch.processing_status !== "ended") {
      console.log(`  ステータス: ${batch.processing_status}（まだ処理中）`);
      console.log("  しばらく後に再実行してください。");
      process.exit(0);
    }

    console.log("  完了！結果を収集中...");
    let succeeded = 0;
    let failed = 0;

    for await (const result of await anthropic.messages.batches.results(batchId)) {
      if (result.result.type !== "succeeded") { failed++; continue; }
      const content = result.result.message.content[0];
      if (content.type !== "text") continue;

      try {
        const jsonMatch = content.text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error("JSON not found");
        const parsed = JSON.parse(jsonMatch[0]) as DescriptionResult;
        descriptionMap[result.custom_id.replace("game-", "")] = parsed;
        succeeded++;
      } catch { failed++; }
    }

    console.log(`  成功: ${succeeded}件 / 失敗: ${failed}件`);
  }

  fs.writeFileSync(outputPath, JSON.stringify(descriptionMap, null, 2), "utf-8");
  console.log(`\n→ data/batch-results.json に保存しました（${Object.keys(descriptionMap).length}件）`);

  return descriptionMap;
}

// Mechanicsを一括翻訳してdata/mechanics-translations.jsonに保存
async function translateMechanics(games: GameRecord[]): Promise<Record<string, string>> {
  const outputPath = path.join(__dirname, "../data/mechanics-translations.json");

  // 既存のJSONがあればスキップ
  if (fs.existsSync(outputPath)) {
    console.log(`mechanics-translations.json が既に存在します。再利用します。`);
    return JSON.parse(fs.readFileSync(outputPath, "utf-8")) as Record<string, string>;
  }

  const allMechanics = [
    ...new Set(
      games.flatMap((g) =>
        g["Mechanics"] ? g["Mechanics"].split(",").map((m) => m.trim()).filter(Boolean) : []
      )
    ),
  ].sort();

  console.log(`\nMechanicsを翻訳中... (${allMechanics.length}種類)`);

  const message = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 4096,
    messages: [{
      role: "user",
      content: `以下のボードゲームメカニクス名を日本語に翻訳してください。
JSONオブジェクト形式で「英語名: 日本語名」のペアのみを出力してください。

${allMechanics.join("\n")}`,
    }],
  });

  const text = message.content[0].type === "text" ? message.content[0].text : "{}";
  let translationMap: Record<string, string> = {};
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) translationMap = JSON.parse(jsonMatch[0]) as Record<string, string>;
  } catch {
    console.warn("  翻訳のパースに失敗。英語名をそのまま使用します。");
  }

  fs.writeFileSync(outputPath, JSON.stringify(translationMap, null, 2), "utf-8");
  console.log(`→ data/mechanics-translations.json に保存しました（${Object.keys(translationMap).length}件）`);

  return translationMap;
}

async function main() {
  const batchIdsPath = path.join(__dirname, "batch-ids.json");
  if (!fs.existsSync(batchIdsPath)) {
    console.error("batch-ids.json が見つかりません。先に submit-batch.ts を実行してください。");
    process.exit(1);
  }

  const batchIds: string[] = (JSON.parse(fs.readFileSync(batchIdsPath, "utf-8")) as (string | null)[]).filter((id): id is string => id !== null);
  console.log(`バッチ数: ${batchIds.length}`);

  const csvPath = path.join(__dirname, "../data/bgg_dataset.csv");
  const games = parseCSV(csvPath);

  const descriptionMap = await collectDescriptions(batchIds);
  const translationMap = await translateMechanics(games);

  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("以下のファイルを確認してください：");
  console.log("  data/batch-results.json         （ゲームの説明文・日本語名）");
  console.log("  data/mechanics-translations.json（Mechanicsの日本語訳）");
  console.log("\n内容に問題がなければ insert-to-db.ts を実行してDBに投入できます。");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  // 未使用変数の警告を避けるため参照
  void descriptionMap;
  void translationMap;
}

main().catch(console.error);
