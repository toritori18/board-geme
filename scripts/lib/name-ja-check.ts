// data/name-ja/names_NN.tsv（英語名の元データ）と result_NN.tsv（claude.aiが出力した
// 日本語名）が、行数・ID列・順序まで完全に一致しているかを検証する共通ロジック。
// scripts/verify-name-ja.ts（検証専用CLI）と scripts/merge-name-ja.ts（マージ前チェック）
// の両方から使うため、csv.ts と同様に scripts/lib/ に切り出す。
import fs from "node:fs";
import path from "node:path";

// ひらがな・カタカナ・漢字のいずれかを含むかで日本語訳済みと判定する。
// docs/sql/insert_transaction_data.sql 反映後の検証クエリ（ぁ-んァ-ヶ一-龠）と同じ範囲。
// extract-name-ja.ts と merge-name-ja.ts の両方から使うため、判定基準がずれないようここに集約する。
export const JAPANESE_RE = /[ぁ-んァ-ヶ一-龠]/;

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

// dir が存在しない場合は fs.readdirSync() を呼ばずに空配列を返す。ディレクトリが無い場合に
// 空配列を返すのは、呼び出し側の length === 0 分岐で diagnoseNoNamesFiles() が理由を
// 切り分けて案内するため（ここで例外を投げると呼び出し側の分岐に到達できない）。
export function listNamesFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];

  return fs
    .readdirSync(dir)
    .filter((f) => /^names_\d+\.tsv$/.test(f))
    .sort();
}

// names_*.tsv が1本も無いときの原因の切り分け結果。
// - "no-dir": data/name-ja ディレクトリ自体が存在しない（extract-name-ja.ts が一度も
//   実行されていない）
// - "not-started": ディレクトリはあるが names_*.tsv も result_*.tsv も無い（未着手）
// - "all-translated": names_*.tsv は無いが result_*.tsv が残っている。extract-name-ja.ts は
//   毎回 names_*.tsv を作り直す際に既存分を削除するが、抽出対象が0件（＝CSV上の全ゲームが
//   翻訳済み）だと1本も生成しないため、この状態になる。result_*.tsv は手作業の成果物のため
//   削除されずに残り続ける
export type NoNamesFilesReason = "no-dir" | "not-started" | "all-translated";

export type NoNamesFilesDiagnosis = {
  reason: NoNamesFilesReason;
  orphanFiles: string[];
};

// names_*.tsv が0本だったときに、その原因を上記3パターンに切り分ける。
// verify-name-ja.ts と merge-name-ja.ts の両方が「names_*.tsv が見つかりません」という
// 同じ誤案内（extract-name-ja.ts の再実行を促す）を出していたが、抽出対象0件（全件翻訳済み）
// で extract が終了した後は再実行しても状況が変わらず堂々巡りになるため、原因ごとに
// メッセージを出し分けられるようにする。
export function diagnoseNoNamesFiles(dir: string): NoNamesFilesDiagnosis {
  if (!fs.existsSync(dir)) {
    return { reason: "no-dir", orphanFiles: [] };
  }

  const orphanFiles = listOrphanResultFiles(dir);
  if (orphanFiles.length === 0) {
    return { reason: "not-started", orphanFiles: [] };
  }
  return { reason: "all-translated", orphanFiles };
}

// result_*.tsv のうち、対応する names_*.tsv が存在しないもの（孤立ファイル）を返す。
// checkNameJaFiles() は names_*.tsv を起点に走査するため、names_*.tsv が無い result_*.tsv
// は一度も検証されない。extract-name-ja.ts の再実行で抽出対象が減り names_*.tsv の本数が
// 変わると発生しうるため、マージ前・検証時の両方で気付けるように分けて公開する。
// dir が存在しない場合は fs.readdirSync() を呼ばずに空配列を返す（listNamesFiles() と同じ理由）。
export function listOrphanResultFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];

  const namesSuffixes = new Set(
    listNamesFiles(dir).map((f) => f.match(/^names_(\d+)\.tsv$/)![1])
  );

  return fs
    .readdirSync(dir)
    .filter((f) => {
      const match = f.match(/^result_(\d+)\.tsv$/);
      return match !== null && !namesSuffixes.has(match[1]);
    })
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
