# CLAUDE.md — Board Game Project

## プロジェクト概要

このプロジェクトは、ボードゲームのランキングを作成・管理するアプリケーションです。
ユーザーがボードゲームを登録・評価し、スコアや人気度に基づいたランキングを表示することを目的としています。

このファイルはClaude Codeがプロジェクトを理解するためのガイドです。

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
├── src/                    # ソースコード
│   ├── components/         # UIコンポーネント
│   ├── pages/              # ページ
│   ├── utils/              # ユーティリティ
│   ├── assets/             # 画像・フォントなどの静的リソース
│   └── styles/             # スタイルシート
├── public/                 # 公開静的ファイル
├── docs/                   # ドキュメント
│   ├── git-rules.md        # Git運用ルール
│   ├── setup.md            # セットアップガイド
│   └── contributing.md     # コントリビュートガイド
└── tests/                  # テスト
```
