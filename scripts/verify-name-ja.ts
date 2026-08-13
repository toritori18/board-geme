// data/name-ja/result_NN.tsv（claude.aiが出力した「ID<TAB>日本語名」）を、対応する
// names_NN.tsv（extract-name-ja.tsが生成した「ID<TAB>英語名<TAB>出版年」）と突き合わせ、
// 行数・ID列・順序が完全に一致しているかを検証する。claude.aiは長い出力の途中で行を
// 落とすことがあるため、merge-name-ja.ts でマージする前に必ずこのスクリプトを通す。
// 全21ファイルが揃っていなくても、存在する result_*.tsv だけで実行できる
// （未着手の番号は「未着手」として報告するだけでエラーにはしない）。
import path from "node:path";
import { fileURLToPath } from "node:url";
import { checkNameJaFiles } from "./lib/name-ja-check.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function main() {
  const dir = path.join(__dirname, "../data/name-ja");
  const results = checkNameJaFiles(dir);

  if (results.length === 0) {
    console.error("data/name-ja/names_*.tsv が見つかりません。先に npm run seed:extract-name-ja を実行してください。");
    process.exit(1);
  }

  let okCount = 0;
  let notStartedCount = 0;
  let mismatchCount = 0;

  for (const r of results) {
    if (r.status === "not-started") {
      console.log(`[未着手] ${r.resultFile} がありません`);
      notStartedCount++;
      continue;
    }

    if (r.status === "mismatch") {
      console.error(`[不一致] ${r.resultFile}`);
      for (const e of r.errors) console.error(`  - ${e}`);
      mismatchCount++;
    } else {
      console.log(`[OK] ${r.resultFile}（${r.resultLines}件）`);
      okCount++;
    }

    for (const w of r.warnings) console.warn(`  [警告] ${w}`);
  }

  console.log(`\n完了: OK ${okCount}件 / 未着手 ${notStartedCount}件 / 不一致 ${mismatchCount}件`);

  if (mismatchCount > 0) {
    console.error("\n不一致があります。data/name-ja/result_*.tsv を修正してから再実行してください。");
    process.exit(1);
  }
}

main();
