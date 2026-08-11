// 前提: このパーサは data/bgg_dataset.csv 専用の最小実装であり、汎用CSVパーサではない。
// - 区切り文字は `;` 固定
// - 引用符・フィールド内改行・エスケープには対応していない（単純に `split(";")` するだけ）
// 実データ（2026-08-09時点）では引用符を含む行が13件あるが、そのいずれも引用符の内側に
// 区切り文字 `;` を含まないことを確認済みのため、`split(";")` でも列がずれずに正しく
// 分割できる。列の値に `;` が混ざる別のCSVを渡すと、引用符の有無にかかわらず
// 黙って全列がずれるため、このファイルを他のCSVの読み込みに転用しないこと。
import fs from "node:fs";

export type GameRecord = Record<string, string>;

export function parseCSV(filePath: string): GameRecord[] {
  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.split("\n").filter((line) => line.trim());
  const headerLine = lines[0];
  // 空ファイル・ヘッダ行が無いCSVを渡すと lines[0] が undefined になり、
  // 呼び出し元で「Cannot read properties of undefined」という原因不明なエラーで
  // 落ちてしまう。何が問題か（対象ファイル）が分かる形で明示的に失敗させる。
  if (headerLine === undefined) {
    throw new Error(`CSVが空か、ヘッダ行がありません: ${filePath}`);
  }
  const headers = headerLine.split(";").map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const values = line.split(";");
    return Object.fromEntries(headers.map((h, i) => [h, (values[i] ?? "").trim()]));
  });
}
