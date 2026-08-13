// data/name-ja/names_NN.tsv（英語名の元データ）と result_NN.tsv（claude.aiが出力した
// 日本語名）が、行数・ID列・順序まで完全に一致しているかを検証する共通ロジック。
// scripts/verify-name-ja.ts（検証専用CLI）と scripts/merge-name-ja.ts（マージ前チェック）
// の両方から使うため、csv.ts と同様に scripts/lib/ に切り出す。
import fs from "node:fs";
import path from "node:path";

export type NameJaFileCheck = {
  namesFile: string;
  resultFile: string;
  status: "ok" | "mismatch" | "not-started";
  namesLines: number;
  resultLines: number;
  errors: string[];
  warnings: string[];
};

// ファイル末尾の改行1個は空行として数えない（保存時に付与されるため）。
// それ以外の空行は行ズレの手がかりになりうるため、そのまま1行として扱う。
function readLines(filePath: string): string[] {
  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.split(/\r\n|\n/);
  if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  return lines;
}

export function listNamesFiles(dir: string): string[] {
  return fs
    .readdirSync(dir)
    .filter((f) => /^names_\d+\.tsv$/.test(f))
    .sort();
}

// dir 配下の names_NN.tsv すべてについて、対応する result_NN.tsv との整合性を確認する。
// result_NN.tsv が存在しない番号は "not-started" として返す（全ファイルが揃う前でも
// 呼び出せるようにするため）。
export function checkNameJaFiles(dir: string): NameJaFileCheck[] {
  const namesFiles = listNamesFiles(dir);

  return namesFiles.map((namesFile) => {
    const suffix = namesFile.match(/^names_(\d+)\.tsv$/)![1];
    const resultFile = `result_${suffix}.tsv`;
    const resultPath = path.join(dir, resultFile);

    if (!fs.existsSync(resultPath)) {
      return {
        namesFile,
        resultFile,
        status: "not-started",
        namesLines: 0,
        resultLines: 0,
        errors: [],
        warnings: [],
      };
    }

    const namesLines = readLines(path.join(dir, namesFile));
    const resultLines = readLines(resultPath);

    const errors: string[] = [];
    if (namesLines.length !== resultLines.length) {
      errors.push(
        `行数が一致しません（${namesFile}: ${namesLines.length}行 / ${resultFile}: ${resultLines.length}行）`
      );
    }

    const warnings: string[] = [];
    const compareLen = Math.min(namesLines.length, resultLines.length);
    for (let i = 0; i < compareLen; i++) {
      const namesId = namesLines[i].split("\t")[0];
      const resultCols = resultLines[i].split("\t");
      const resultId = resultCols[0];

      if (namesId !== resultId) {
        errors.push(`${i + 1}行目: ID不一致（${namesFile}: "${namesId}" / ${resultFile}: "${resultId}"）`);
      }

      const nameJa = resultCols[1];
      if (!nameJa) {
        warnings.push(`${i + 1}行目: 日本語名が空です（ID: ${resultId || "(空行)"}）`);
      }
    }

    return {
      namesFile,
      resultFile,
      status: errors.length > 0 ? "mismatch" : "ok",
      namesLines: namesLines.length,
      resultLines: resultLines.length,
      errors,
      warnings,
    };
  });
}
