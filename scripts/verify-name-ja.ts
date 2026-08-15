// data/name-ja/result_NN.tsv（claude.aiが出力した「ID<TAB>日本語名」）を、対応する
// names_NN.tsv（extract-name-ja.tsが生成した「ID<TAB>英語名<TAB>出版年」）と突き合わせ、
// 行数・ID列・順序が完全に一致しているかを検証する。claude.aiは長い出力の途中で行を
// 落とすことがあるため、merge-name-ja.ts でマージする前に必ずこのスクリプトを通す。
// 全21ファイルが揃っていなくても、存在する result_*.tsv だけで実行できる
// （未着手の番号は「未着手」として報告するだけでエラーにはしない）。
import path from "node:path";
import { fileURLToPath } from "node:url";
import { checkNameJaFiles, diagnoseNoNamesFiles, listOrphanResultFiles } from "./lib/name-ja-check.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function main() {
  const dir = path.join(__dirname, "../data/name-ja");
  const results = checkNameJaFiles(dir);

  if (results.length === 0) {
    // names_*.tsv が0本の原因は一様ではない（diagnoseNoNamesFiles のコメント参照）。
    // 「extract-name-ja.ts を実行してください」は未着手のとき以外は誤案内になるため、
    // 原因ごとにメッセージを出し分ける。
    const diagnosis = diagnoseNoNamesFiles(dir);
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
        "names_*.tsv が無いと result_*.tsv と突き合わせて検証できないため、この検証は行いません。"
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

  // 対応する names_*.tsv が無い result_*.tsv（孤立ファイル）は上のループの走査対象外
  // （checkNameJaFiles は names_*.tsv 起点のため）で一度も検証されない。verify は
  // 検証専用CLIなので、ここでも気付けるよう別途検出して報告する。
  const orphanFiles = listOrphanResultFiles(dir);
  for (const f of orphanFiles) {
    console.warn(`[警告] ${f} は対応する names_*.tsv がなく未検証です（孤立ファイル）`);
  }

  console.log(
    `\n完了: OK ${okCount}件 / 未着手 ${notStartedCount}件 / 不一致 ${mismatchCount}件 / 孤立 ${orphanFiles.length}件`
  );

  if (mismatchCount > 0) {
    console.error("\n不一致があります。data/name-ja/result_*.tsv を修正してから再実行してください。");
  }
  if (orphanFiles.length > 0) {
    console.error(
      "\n孤立した result_*.tsv があります。npm run seed:extract-name-ja の再実行で対象が変わった" +
        "可能性があります。不要なら削除、必要なら names 側と対応を取り直してください。"
    );
  }
  // 孤立ファイルは merge-name-ja.ts では中断（process.exit(1)）扱いのため、verify でも
  // 不一致と同様に非0終了させ、「verifyが通ってもmergeで初めて気付く」事態を避ける。
  if (mismatchCount > 0 || orphanFiles.length > 0) {
    process.exit(1);
  }
}

main();
