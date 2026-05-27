# CLAUDE.md — Board Game Project

## プロジェクト概要

このプロジェクトは、ボードゲームのランキングを作成・管理するアプリケーションです。
ユーザーがボードゲームを登録・評価し、スコアや人気度に基づいたランキングを表示することを目的としています。

このファイルはClaude Codeがプロジェクトを理解するためのガイドです。

## 技術スタック

| 役割 | 技術 |
|---|---|
| フロントエンド | Next.js (React), Tailwind CSS |
| バックエンド | Next.js API Routes / Server Actions |
| DB・認証 | Supabase (PostgreSQL) |
| ホスティング | Vercel |

詳細は [docs/tech-stack.md](docs/tech-stack.md) を参照してください。

## Git運用ルール

Gitに関するルールは以下のファイルを参照してください:

**[docs/git-rules.md](docs/git-rules.md)**

## ディレクトリ構成

```
board-geme/
├── CLAUDE.md               # このファイル
├── README.md               # プロジェクト説明
├── package.json            # 依存関係・スクリプト
├── .gitignore
├── .env.example            # 環境変数のサンプル
├── .claude/                # Claude Code設定
│   ├── commands/           # カスタムスラッシュコマンド
│   │   └── git/push.md     # /git push コマンド定義
│   └── push.ps1            # pushコマンドが実行するスクリプト
├── src/                    # ソースコード
│   ├── components/         # UIコンポーネント
│   ├── pages/              # ページ
│   ├── utils/              # ユーティリティ
│   ├── assets/             # 画像・フォントなどの静的リソース
│   └── styles/             # スタイルシート
├── public/                 # 公開静的ファイル
├── docs/                   # ドキュメント
│   ├── git-rules.md        # Git運用ルール
│   ├── tech-stack.md       # 技術スタック
│   ├── setup.md            # セットアップガイド
│   └── contributing.md     # コントリビュートガイド
└── tests/                  # テスト
```