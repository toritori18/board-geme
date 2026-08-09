import Anthropic from "@anthropic-ai/sdk";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseCSV, type GameRecord } from "./lib/csv.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const TEST_LIMIT = 10;

function buildPrompt(game: GameRecord): string {
  return `以下のボードゲームについてJSONで回答してください。

ゲーム名: ${game["Name"]}
ジャンル: ${game["Domains"] || "不明"}
メカニクス: ${game["Mechanics"] || "不明"}

以下の形式のJSONのみを出力してください（余分なテキスト不要）：
{"name_ja": "日本語名（公式名があればそれを、なければカタカナ表記で）", "short_description_ja": "30〜50文字の日本語紹介文"}`;
}

type OutputRecord = {
  bgg_rank: string;
  name: string;
  name_ja: string;
  short_description_ja: string;
  error?: string;
};

async function main() {
  const csvPath = path.join(__dirname, "../data/bgg_dataset.csv");
  const games = parseCSV(csvPath).slice(0, TEST_LIMIT);
  const output: OutputRecord[] = [];

  console.log(`最初の ${TEST_LIMIT} 件をテスト生成します...\n`);
  console.log("─".repeat(60));

  for (const game of games) {
    process.stdout.write(`[${game["BGG Rank"]}位] ${game["Name"]} ... `);

    const message = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 200,
      messages: [{ role: "user", content: buildPrompt(game) }],
    });

    const text = message.content[0].type === "text" ? message.content[0].text : "";

    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("JSON not found");
      const result = JSON.parse(jsonMatch[0]) as { name_ja: string; short_description_ja: string };

      console.log("OK");
      console.log(`  name_ja           : ${result.name_ja}`);
      console.log(`  short_description : ${result.short_description_ja}`);
      output.push({
        bgg_rank: game["BGG Rank"],
        name: game["Name"],
        name_ja: result.name_ja,
        short_description_ja: result.short_description_ja,
      });
    } catch {
      console.log("パースエラー");
      console.log(`  raw output: ${text}`);
      output.push({
        bgg_rank: game["BGG Rank"],
        name: game["Name"],
        name_ja: "",
        short_description_ja: "",
        error: text,
      });
    }

    console.log("─".repeat(60));
  }

  const outputPath = path.join(__dirname, "../data/test-output.json");
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2), "utf-8");
  console.log(`\n結果を ${outputPath} に保存しました。`);
  console.log("内容を確認して問題なければ npm run seed:submit を実行してください。");
}

main().catch(console.error);
