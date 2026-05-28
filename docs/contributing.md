# コントリビュートガイド

## 開発フロー

1. `main` ブランチから feature ブランチを作成する
2. 変更を実装する
3. プルリクエストを作成する

## コーディング規約

### 言語・型

- TypeScript（`.ts` / `.tsx`）のみ使用する
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

### コメント

- コメントは日本語で書く
- 自明な処理にコメントは書かない。「なぜそうしているか」が非自明な場合のみ書く

## 禁止事項

- `any` 型の使用（ESLintにより `error` として検出される）
- `console.log` を本番コードに残すこと（ESLintにより `warn` として検出される）
- APIキー・シークレットのコードへの直書き（必ず `.env.local` 経由で参照する）
- `.env.local` の git へのコミット

## プルリクエストのルール

- タイトルはコミットメッセージ規約に従う（[git-rules.md](git-rules.md) 参照）
- CI がすべて通過していること
