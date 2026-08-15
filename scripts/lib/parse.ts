// CSVから読んだ文字列を数値に変換する共通ヘルパ。scripts/ 配下の複数スクリプトに
// 同じ実装が重複していたため、ここに集約する。

// 整数へのパース。空文字・数値以外は null を返す。
export function parseIntOrNull(value: string): number | null {
  // 基数を明示しないと、先頭が "0x" の値が16進数として解釈されてしまう。
  // CSVの数値列は10進数のみを想定しているため、必ず10進数として解釈する。
  const n = parseInt(value, 10);
  return isNaN(n) ? null : n;
}

// 小数へのパース。空文字・数値以外は null を返す。
export function parseNumberOrNull(value: string): number | null {
  // replace(",", ".") だと最初の1個しか置換されないため、"," が複数含まれる値で
  // 2個目以降が残ってしまう。replaceAll() で全て置換する。
  const n = parseFloat(value.replaceAll(",", "."));
  return isNaN(n) ? null : n;
}
