# Board Game Ranking

ボードゲームを検索し、人気ランキングを閲覧できるWebアプリケーションです。

## 機能

- ボードゲームの検索（キーワード・プレイ人数・所要時間・難易度・ジャンルで絞り込み）
- 評価スコア順の人気ランキング表示
- ユーザー認証（ログイン・新規登録）

## 技術スタック

| 役割 | 技術 |
|---|---|
| フロントエンド | Next.js (React), Tailwind CSS |
| バックエンド | Next.js API Routes / Server Actions |
| DB・認証 | Supabase (PostgreSQL) |
| ホスティング | Vercel |

詳細は [docs/tech-stack.md](docs/tech-stack.md) を参照してください。

### 認証の構成（Supabase Auth と自前実装の併用）

パスワードは Supabase Auth と `M_USER` テーブルの2箇所で管理しています。認証まわりを変更する際は両方の整合に注意してください。

| 処理 | 実装 |
|---|---|
| ログイン | `supabase.auth` を使わず、`M_USER.password_hash` を `bcryptjs` で照合（[login.ts](src/pages/api/auth/login.ts)） |
| パスワード再設定・初期設定 | Supabase Auth（`resetPasswordForEmail` / `exchangeCodeForSession` / `updateUser`）を使い、**併せて `M_USER.password_hash` も更新する**（[reset-password.ts](src/pages/api/auth/reset-password.ts) / [set-password.ts](src/pages/api/auth/set-password.ts)） |

片方だけを更新すると、新しいパスワードでログインできなくなります。

## セットアップ

[docs/development-setup.md](docs/development-setup.md) を参照してください。

## ディレクトリ構成

```
board-geme/
├── README.md               # このファイル
├── CLAUDE.md               # Claude Code向けガイド
├── package.json            # 依存関係・スクリプト
├── .gitignore
├── .env.example             # 環境変数のサンプル
├── .editorconfig            # 文字コード・改行・インデントの規約
├── .github/                 # GitHub 設定
│   └── workflows/           # CI ワークフロー
│       └── ci.yml           # 継続的統合（PR・push 時の自動検査）
├── .claude/                 # Claude Code設定
│   ├── settings.json        # 権限・フック設定
│   ├── factcheck.md         # ハルシネーション防止チェックリスト
│   ├── agents/               # 専門エージェント（coder / code-reviewer / readme-syncer）
│   ├── commands/              # カスタムスラッシュコマンド（.md + 実行スクリプト）
│   │   ├── verify-docs.ps1     # ドキュメント参照先検査（共有スクリプト）
│   │   ├── git/
│   │   ├── server/
│   │   └── db/
│   └── hooks/                 # git hooks・PreToolUse等のフックスクリプト
├── src/                     # ソースコード
│   ├── components/          # UIコンポーネント
│   ├── pages/                # ページ（Pages Router）・APIルート
│   ├── types/                 # 型定義
│   ├── utils/                  # ユーティリティ
│   ├── data/                    # 静的データ（JSON等）
│   ├── assets/                   # 画像・フォントなどの静的リソース
│   └── styles/                    # スタイルシート
├── public/                  # 静的ファイル配信（Next.js）
│   └── img/                 # 画像
├── docs/                    # ドキュメント
│   ├── git-rules.md         # Git運用ルール
│   ├── tech-stack.md        # 技術スタック
│   ├── development-setup.md  # セットアップガイド
│   ├── contributing.md        # コントリビュートガイド
│   ├── powershell-contributing.md  # PowerShell（`.ps1`）のコーディング規約
│   └── sql/                    # DBスキーマSQL（Supabase SQL Editorで実行）
├── scripts/                 # データ投入・バッチ処理スクリプト
└── tests/                   # テスト
```

## コマンド一覧

### スラッシュコマンド（Claude Code）

`.claude/commands/` に定義されたカスタムコマンドです。

#### セットアップ・開発サーバー

| コマンド | 概要 |
|---|---|
| `/setup` | 初回セットアップ（`setup.ps1` を実行）。完了後に `.env.local` の設定と `/git:init` を案内します |
| `/server:start` | 開発サーバーをバックグラウンドで起動（ポート3000の既存プロセスを停止してから起動。ログ: `.claude/dev-server.log`） |
| `/server:stop` | 開発サーバーを停止 |

#### 検査・ビルド

| コマンド | 概要 |
|---|---|
| `/lint` | `npm run lint` で静的解析を実行 |
| `/typecheck` | `npx tsc --noEmit` で型検査を実行 |
| `/build` | `npm run build` で本番用ビルドを実行 |
| `/check` | プッシュ前の総点検。ドキュメント参照先検査 → lint → 型検査 → ビルドを順に実行し、失敗した時点で停止 |
| `/test` | 自動テストのフレームワークは未導入のため、実行せずその旨を報告します |
| `/format` | 自動フォーマッタ（Prettier等）は未導入のため、実行せずその旨を報告します |

#### Git・デプロイ

| コマンド | 概要 |
|---|---|
| `/git:init` | git リポジトリの初期化と git hooks（pre-push の機密情報チェック）の登録 |
| `/git:branch <名前>` | 指定した名前でブランチを作成してチェックアウト（`feature/` / `fix/` / `docs/`） |
| `/git:diff` | `git diff` で変更差分を表示 |
| `/git:push <メッセージ>` | 未追跡ファイルを確認 → シークレットチェック → コミット → プッシュ |
| `/git:pr` | 現在のブランチから main への Pull Request を作成（`gh` CLI を使用） |
| `/git:merge [PR番号]` | PR の状態・CI・マージ可否を確認したうえで main へマージ（`gh` CLI を使用） |
| `/git:cleanup` | main にマージ済みのローカルブランチを一覧表示。確認が取れた場合のみ削除（`-Delete Local` / `LocalAndRemote`） |
| `/deploy` | デプロイ手順の案内。PR を main にマージすると Vercel が自動デプロイします |

#### その他

| コマンド | 概要 |
|---|---|
| `/plan` | 会話の内容をもとに Plan mode で実装プランを整理 |
| `/db:migrate` | DBスキーマ変更の手順案内。`docs/sql/` に SQL を追加し Supabase の SQL Editor で実行する運用です |

### npm スクリプト

| コマンド | 概要 |
|---|---|
| `npm run dev` | 開発サーバーを起動（`next dev`） |
| `npm run build` | 本番用ビルド（`next build`） |
| `npm run start` | ビルド済みアプリを起動（`next start`） |
| `npm run lint` | 静的解析（`next lint`） |
| `npm run seed:test` | 投入データのテスト用スクリプト（`scripts/test-seed.ts`） |
| `npm run seed:submit` | バッチ処理のリクエスト送信（`scripts/submit-batch.ts`） |
| `npm run seed:collect` | バッチ処理の結果取得（`scripts/collect-batch.ts`） |
| `npm run seed:insert` | 取得データをDBへ投入（`scripts/insert-to-db.ts`） |
| `npm run seed:generate-sql` | 投入用SQLの生成（`scripts/generate-sql.ts`） |

## サブエージェント

`.claude/agents/` に定義された専門エージェントです。Claude Code から用途に応じて呼び出されます。

| 名前 | 役割 | ツール |
|---|---|---|
| `coder` | コンポーネント・関数・ロジックの新規実装や修正。実装前に `docs/contributing.md`・`docs/tech-stack.md`・`.claude/factcheck.md`・`.editorconfig` を読み、パッケージ・API の実在確認を行う | Read, Write, Edit, Glob, Grep, Bash |
| `code-reviewer` | 実装後・コミット前のレビュー。`docs/contributing.md` の規約と `.claude/factcheck.md` に照らしてチェックする | Read, Grep, Glob |
| `readme-syncer` | README.md と実体（コマンド・エージェント・npm スクリプト・ディレクトリ構成）の乖離を検出・修正。リポジトリ全体を読み取り、README.md のみを編集する | Read, Edit, Glob, Grep, Bash |

## 開発ルール

- Git運用: [docs/git-rules.md](docs/git-rules.md)
- コントリビュート: [docs/contributing.md](docs/contributing.md)
- PowerShell（`.ps1`）: [docs/powershell-contributing.md](docs/powershell-contributing.md)
