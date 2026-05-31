import Anthropic from "@anthropic-ai/sdk";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

type GameRecord = Record<string, string>;

function parseCSV(filePath: string): GameRecord[] {
  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.split("\n").filter((line) => line.trim());
  const headers = lines[0].split(";").map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const values = line.split(";");
    return Object.fromEntries(headers.map((h, i) => [h, (values[i] ?? "").trim()]));
  });
}

function buildPrompt(game: GameRecord): string {
  return `以下のボードゲームについてJSONで回答してください。

ゲーム名: ${game["Name"]}
ジャンル: ${game["Domains"] || "不明"}
メカニクス: ${game["Mechanics"] || "不明"}

以下の形式のJSONのみを出力してください（余分なテキスト不要）：
{"name_ja": "日本語名（公式名があればそれを、なければカタカナ表記で）", "short_description_ja": "30〜50文字の日本語紹介文"}`;
}

async function main() {
  const csvPath = path.join(__dirname, "../data/bgg_dataset.csv");
  const games = parseCSV(csvPath);
  console.log(`総ゲーム数: ${games.length}`);

  const BATCH_SIZE = 10000;
  const outputPath = path.join(__dirname, "batch-ids.json");

  // 既存のbatch-ids.jsonがあれば読み込む（nullは失敗バッチ＝再送対象）
  const batchIds: (string | null)[] = fs.existsSync(outputPath)
    ? (JSON.parse(fs.readFileSync(outputPath, "utf-8")) as (string | null)[])
    : [];

  const totalBatches = Math.ceil(games.length / BATCH_SIZE);
  const pendingCount = batchIds.filter((id) => id === null).length;
  const newCount = Math.max(0, totalBatches - batchIds.length);
  console.log(`送信済み: ${batchIds.filter(Boolean).length}件 / 再送: ${pendingCount}件 / 新規: ${newCount}件`);

  // batchIdsの長さをtotalBatchesに合わせてnullで埋める
  while (batchIds.length < totalBatches) batchIds.push(null);

  for (let batchIdx = 0; batchIdx < batchIds.length; batchIdx++) {
    if (batchIds[batchIdx] !== null) continue; // 送信済みはスキップ

    const i = batchIdx * BATCH_SIZE;
    const batchGames = games.slice(i, i + BATCH_SIZE);
    const batchNum = batchIdx + 1;
    console.log(`バッチ ${batchNum} を送信中... (${batchGames.length}件)`);

    const allRequests = batchGames.map((game) => ({
      custom_id: `game-${game["ID"]}`,
      params: {
        model: "claude-haiku-4-5-20251001" as const,
        max_tokens: 200,
        messages: [
          {
            role: "user" as const,
            content: buildPrompt(game),
          },
        ],
      },
    }));

    // バッチ内でcustom_idが重複するリクエストを除去
    const seenIds = new Set<string>();
    const requests = allRequests.filter((req) => {
      if (seenIds.has(req.custom_id)) return false;
      seenIds.add(req.custom_id);
      return true;
    });
    const skipped = allRequests.length - requests.length;
    if (skipped > 0) console.log(`  （重複ID ${skipped}件をスキップ）`);

    const batch = await anthropic.messages.batches.create({ requests });
    batchIds[batchIdx] = batch.id;
    fs.writeFileSync(outputPath, JSON.stringify(batchIds, null, 2));
    console.log(`  → バッチID: ${batch.id}`);
  }

  console.log(`\nバッチ送信完了！`);
  console.log(`バッチID を ${outputPath} に保存しました。`);
  console.log("数時間〜24時間後に collect-batch.ts を実行してください。");
}

main().catch(console.error);
