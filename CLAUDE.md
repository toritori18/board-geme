# CLAUDE.md — Board Game Project

## 基本ルール

- 応答・コミットメッセージ・PR の説明は日本語で書く
- コーディング（コンポーネント・関数・ロジックの新規実装や修正）は `coder` エージェントに委任する
- カスタムコマンド・サブエージェント・npm スクリプト・ディレクトリ構成を追加/削除/リネームしたときは、`readme-syncer` エージェントで [README.md](README.md) を同期する
- この `CLAUDE.md` の変更は、ユーザーの明示的な指示がある場合のみ行う（フックにより確認が入る）

## プロジェクト概要

ボードゲームを検索し、人気ランキングを閲覧できる Web アプリ。
スタックは [README.md](README.md#技術スタック) / [docs/tech-stack.md](docs/tech-stack.md) を参照。

## Git運用ルール（要約）

- `main` への直接コミット・プッシュは禁止（`/git:push` でもブロックされる）
- 機能追加は `feature/<機能名>`、バグ修正は `fix/<バグ名>` ブランチで作業し、PR 経由で main へマージする
- コミットメッセージは `feat:` / `fix:` / `refactor:` / `docs:` / `chore:` のプレフィックスを付ける

詳細は **[docs/git-rules.md](docs/git-rules.md)** を参照してください。
