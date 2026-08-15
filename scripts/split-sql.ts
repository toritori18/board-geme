// docs/sql/insert_transaction_data.sql（generate-sql.tsが生成する41個のINSERTブロック、
// 5.77MB）をSupabase SQL Editorに貼れるサイズへ分割する。SQL Editorは
// 「Query is too large to be run via the SQL Editor」というサイズ上限エラーを返すため、
// 1つのINSERT文（INSERT INTO 〜 ON CONFLICT ...;）を絶対に途中で切らず、指定バイト数
// （既定500KB）以下になるようブロック単位でファイルをまとめ直す。
// Anthropic API・Supabase接続とも不要で、既存のSQLファイルをテキストとして読み書きするだけ。
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DEFAULT_MAX_KB = 500;

// ヘッダーコメント（元ファイル名・パート番号・データ行数）のバイト数を保守的に見積もった
// 予約分。ブロックのグループ分けをする時点ではパート総数が未確定でヘッダーの正確な
// バイト数を先に算出できないため、この分をあらかじめ上限から差し引いておくことで、
// ヘッダーを足した後の実ファイルサイズが指定上限をほぼ超えないようにする。
const HEADER_RESERVE_BYTES = 512;

// ブロック同士を連結する際の区切り文字。出力時（groups.forEachのbody生成）とサイズ計算
// （groupBlocks）の両方でこの定数を使うことで、区切りバイト数の見積もりが将来ずれないようにする。
const BLOCK_SEPARATOR = "\n\n";
const BLOCK_SEPARATOR_BYTES = Buffer.byteLength(BLOCK_SEPARATOR, "utf-8");

type Block = {
  text: string;
  rowCount: number;
  byteLength: number;
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseMaxKb(argv: string[]): number {
  const arg = argv.find((a) => a.startsWith("--max-kb="));
  if (!arg) return DEFAULT_MAX_KB;

  const raw = arg.slice("--max-kb=".length);
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) {
    console.error(`--max-kb には正の数値を指定してください（指定値: "${raw}"）`);
    process.exit(1);
  }
  return n;
}

// INSERT INTO 〜 ON CONFLICT ...; を1ブロックとして取り出す。Supabase SQL Editorの
// サイズ上限エラーはクエリ全体に対して発生するため、分割はこのブロック境界でしか行えない
// （VALUES句の途中で切ると構文エラーになる）。
function splitIntoBlocks(lines: string[]): Block[] {
  const insertRe = /^INSERT INTO\b/;
  const conflictEndRe = /^ON CONFLICT\b.*;$/;

  let i = 0;
  // 冒頭のコメント行（-- INSERT SQL generated from ... 等）は個々のパートファイルには
  // 引き継がず、パートごとに専用のヘッダーを付け直すため読み飛ばすだけでよい。
  while (i < lines.length && !insertRe.test(lines[i])) {
    i++;
  }

  const blocks: Block[] = [];
  while (i < lines.length) {
    // ブロックの間の空行は出力側で作り直すため読み飛ばす
    if (lines[i].trim() === "") {
      i++;
      continue;
    }
    if (!insertRe.test(lines[i])) {
      throw new Error(`${i + 1}行目が INSERT INTO で始まっていません（想定外のフォーマット）: ${lines[i]}`);
    }

    const start = i;
    while (i < lines.length && !conflictEndRe.test(lines[i])) {
      i++;
    }
    if (i >= lines.length) {
      throw new Error(`${start + 1}行目から始まるINSERTブロックが ON CONFLICT ...; で閉じられていません`);
    }

    const blockLines = lines.slice(start, i + 1);
    const text = blockLines.join("\n");
    // データ行数 = ブロックからINSERT INTO行とON CONFLICT行を除いた行数
    const rowCount = blockLines.slice(1, -1).filter((l) => l.trim() !== "").length;
    blocks.push({ text, rowCount, byteLength: Buffer.byteLength(text, "utf-8") });

    i++;
  }

  return blocks;
}

// ブロックを、指定バイト数を超えないように先頭から貪欲に詰めていく。1ブロック単体で
// ヘッダー予約分を差し引いた実効上限（effectiveLimit）を超える場合はそもそも他のブロックと
// 同じグループに詰められないため、そのブロックだけで1ファイルにする。
function groupBlocks(blocks: Block[], maxBytes: number): { groups: Block[][]; oversizedCount: number } {
  const effectiveLimit = maxBytes - HEADER_RESERVE_BYTES;
  const groups: Block[][] = [];
  let current: Block[] = [];
  let currentBytes = 0;
  let oversizedCount = 0;

  for (const block of blocks) {
    // 単独ブロックの超過判定も、グループ詰めと同じ effectiveLimit を基準にする。ここを
    // maxBytes 基準にすると、effectiveLimit < サイズ ≤ maxBytes のブロックが警告なしで
    // 単独ファイルになり、ヘッダーを足した実ファイルサイズが --max-kb をわずかに超える。
    if (block.byteLength > effectiveLimit) {
      if (current.length > 0) {
        groups.push(current);
        current = [];
        currentBytes = 0;
      }
      groups.push([block]);
      oversizedCount++;
      continue;
    }

    // 2ブロック目以降を同じグループに追加する場合、出力時に join(BLOCK_SEPARATOR) で挟まる
    // 区切り分のバイト数も加算する（1ブロック目には区切りが付かない）。これを加算しないと
    // 実際の出力サイズより currentBytes が小さく見積もられてしまう。
    const separatorBytes = current.length > 0 ? BLOCK_SEPARATOR_BYTES : 0;
    if (current.length > 0 && currentBytes + separatorBytes + block.byteLength > effectiveLimit) {
      groups.push(current);
      current = [];
      currentBytes = 0;
    }
    currentBytes += (current.length > 0 ? BLOCK_SEPARATOR_BYTES : 0) + block.byteLength;
    current.push(block);
  }
  if (current.length > 0) groups.push(current);

  return { groups, oversizedCount };
}

function buildPartHeader(sourceFileName: string, partIndex: number, totalParts: number, rowCount: number): string {
  return [
    `-- 元ファイル: ${sourceFileName}`,
    `-- パート ${partIndex} / ${totalParts}`,
    `-- データ行数: ${rowCount}`,
    "",
    "",
  ].join("\n");
}

function main() {
  const maxKb = parseMaxKb(process.argv.slice(2));
  const maxBytes = maxKb * 1024;

  const sourcePath = path.join(__dirname, "../docs/sql/insert_transaction_data.sql");
  const outDir = path.join(__dirname, "../docs/sql/split");

  if (!fs.existsSync(sourcePath)) {
    console.error(`${sourcePath} が見つかりません。先に npm run seed:generate-sql を実行してください。`);
    process.exit(1);
  }

  console.log("ファイル読み込み中...");
  const content = fs.readFileSync(sourcePath, "utf-8");
  const lines = content.split("\n");

  const blocks = splitIntoBlocks(lines);
  const totalRowCount = blocks.reduce((sum, b) => sum + b.rowCount, 0);

  const { groups, oversizedCount } = groupBlocks(blocks, maxBytes);

  // 出力先ディレクトリは既存でもよいが、このスクリプトが生成する part ファイルだけを
  // 消してから書き直す。無関係なファイルが置かれていても壊さないため。
  fs.mkdirSync(outDir, { recursive: true });
  const baseName = path.basename(sourcePath, path.extname(sourcePath));
  const partFileRe = new RegExp(`^${escapeRegExp(baseName)}_part\\d+\\.sql$`);
  for (const file of fs.readdirSync(outDir)) {
    if (partFileRe.test(file)) fs.unlinkSync(path.join(outDir, file));
  }

  const totalParts = groups.length;
  const partReports: { file: string; bytes: number; rowCount: number }[] = [];

  groups.forEach((group, idx) => {
    const partIndex = idx + 1;
    const rowCount = group.reduce((sum, b) => sum + b.rowCount, 0);
    const header = buildPartHeader(path.basename(sourcePath), partIndex, totalParts, rowCount);
    const body = group.map((b) => b.text).join(BLOCK_SEPARATOR);
    const fileContent = `${header}${body}\n`;

    const fileName = `${baseName}_part${String(partIndex).padStart(2, "0")}.sql`;
    fs.writeFileSync(path.join(outDir, fileName), fileContent, "utf-8");
    partReports.push({ file: fileName, bytes: Buffer.byteLength(fileContent, "utf-8"), rowCount });
  });

  if (oversizedCount > 0) {
    const effectiveLimitKb = maxKb - HEADER_RESERVE_BYTES / 1024;
    console.warn(
      `警告: 1ブロック単体でヘッダー予約分を差し引いた実効上限（${effectiveLimitKb.toFixed(1)}KB、指定上限 ${maxKb}KB）を` +
        `超えるINSERTブロックが${oversizedCount}件ありました。分割できないため単独ファイルとして出力していますが、` +
        `ヘッダーを足した実ファイルサイズが --max-kb の指定値をわずかに超える可能性があります。`
    );
  }

  console.log(`\n✓ 分割完了: ${totalParts} ファイル`);
  console.log(`  出力先: ${outDir}`);
  for (const r of partReports) {
    console.log(`  ${r.file}: ${(r.bytes / 1024).toFixed(1)} KB（データ行数 ${r.rowCount}）`);
  }

  const splitTotalRowCount = partReports.reduce((sum, r) => sum + r.rowCount, 0);
  console.log(`\n元ファイルのデータ行数: ${totalRowCount}`);
  console.log(`分割後の合計データ行数: ${splitTotalRowCount}`);

  if (splitTotalRowCount !== totalRowCount) {
    console.error("合計データ行数が元ファイルと一致しません。分割処理に問題があります。");
    process.exit(1);
  }
}

main();
