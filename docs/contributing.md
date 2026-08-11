# コントリビュートガイド

## 開発フロー

1. `main` ブランチから feature ブランチを作成する
2. 変更を実装する
3. プルリクエストを作成する

## コーディング規約

### 言語・型

- アプリケーションのロジックは TypeScript（`.ts` / `.tsx`）で書く。`.js` はビルドツールの設定ファイルに限る（下記「設定ファイル（`.js`）」参照）
- `.claude/` 配下の `.ps1` はこのドキュメントの対象外（[powershell-contributing.md](powershell-contributing.md) を参照）
- `any` 型は使用禁止。不明な型は `unknown` を使い、型ガードで絞り込む
- `tsconfig.json` の `strict: true` および ESLint の `@typescript-eslint/no-explicit-any: error` により自動チェックされる

### ファイル・命名

- コンポーネントファイル・クラスは PascalCase（例: `GameCard.tsx`）
- 関数・変数・型フィールドは camelCase（例: `shortDescription`）
- インポートパスは `@/` エイリアスを使用し、相対パス（`../../`）は使わない

### ディレクトリ

| パス | 役割 |
|---|---|
| `src/pages/` | ページコンポーネント（Pages Router） |
| `src/components/` | 再利用可能なUIコンポーネント |
| `src/types/` | 型定義（`named export` で公開） |
| `src/utils/` | ユーティリティ関数 |
| `src/data/` | 静的データ（JSON等） |

### コンポーネント

- ページ・コンポーネントは `default export`
- 型・定数は `named export`

### スタイル

- スタイルは Tailwind CSS のみ使用する
- CSS Modules・インラインの `style` 属性は使わない

#### `.css` ファイル

`.css` は [src/styles/globals.css](../src/styles/globals.css) の1本のみで、Tailwind のディレクティブ（`@tailwind base` / `components` / `utilities`）を読み込むためのファイルである。

- **新しい `.css` ファイルを追加しない。** 個別のスタイルは Tailwind のユーティリティクラスでコンポーネント側に書く
- `globals.css` に素の CSS を書き足さない。Tailwind のユーティリティで表現できないものだけを対象とし、その場合も `@layer base` / `@layer components` / `@layer utilities` のいずれかの中に書く（Tailwind のレイヤー順序を壊さないため）
- 色・余白などの値を直接書かず、Tailwind の設定（[tailwind.config.ts](../tailwind.config.ts) の `theme.extend`）に定義して使う

### 設定ファイル（`.js`）

`.js` はビルドツールの設定ファイルに限る（[next.config.js](../next.config.js) / [postcss.config.js](../postcss.config.js)）。アプリケーションのロジックを `.js` で書かない。

- **CommonJS（`module.exports`）で書く。** `package.json` に `"type": "module"` が無いため、`.js` は CommonJS として読まれる。`export default` は使えない
- 型補完のため、JSDoc の型注釈を付ける（例: `/** @type {import('next').NextConfig} */`）
- **TypeScript で書ける設定ファイルは `.ts` を優先する**（[tailwind.config.ts](../tailwind.config.ts) が該当）。`.js` を新規に増やすのは、ツール側が `.ts` を受け付けない場合に限る

### コメント

- コメントは日本語で書く
- 自明な処理にコメントは書かない。「なぜそうしているか」が非自明な場合のみ書く

## 禁止事項

- 存在しない npm パッケージ・API・メソッドの使用（実装前に [.claude/factcheck.md](../.claude/factcheck.md) のチェックリストに従い実在確認する）
- `any` 型の使用（ESLintにより `error` として検出される）
- `console.log` を本番コードに残すこと（ESLintにより `warn` として検出される）
  - ただし `console.error` / `console.warn` は許可している。サーバーレス環境ではログ収集基盤が別途無く、APIルートで起きた障害を後から追う手段がこれしか無いため。デバッグ目的の出力を消し忘れないことが `no-console` の狙いであり、意図して残す障害ログはその対象外とする
- APIキー・シークレットのコードへの直書き（必ず `.env.local` 経由で参照する）
- `.env.local` の git へのコミット

## プルリクエストのルール

- タイトルはコミットメッセージ規約に従う（[git-rules.md](git-rules.md) 参照）
- CI がすべて通過していること
