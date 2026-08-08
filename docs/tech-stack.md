# 技術スタック

## フロントエンド

| 技術 | 用途 |
|---|---|
| Next.js (React) | UIフレームワーク・ページルーティング・SSR/SSG |
| Tailwind CSS | スタイリング |

## バックエンド

| 技術 | 用途 |
|---|---|
| Next.js API Routes / Server Actions | サーバーサイドのビジネスロジック |

## データベース・認証

| 技術 | 用途 |
|---|---|
| Supabase (PostgreSQL) | データベース・認証・ストレージ |

## インフラ / ホスティング

| 技術 | 用途 |
|---|---|
| Vercel | Next.jsアプリのホスティング・デプロイ |

## 開発ツール

| 技術 | 用途 |
|---|---|
| ESLint（`next/core-web-vitals` + `@typescript-eslint`） | 静的解析（[.eslintrc.json](../.eslintrc.json)） |
| tsx | `scripts/` 配下のデータ投入スクリプトの実行 |

コードフォーマッタ（Prettier等）は未導入。自動テストのフレームワーク（Vitest / Jest等）も未導入。導入する場合は候補の選定が要検討。
