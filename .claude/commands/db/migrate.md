データベース（Supabase / PostgreSQL）のスキーマ変更を行ってください。

現状 Supabase CLI によるマイグレーション管理は未導入です。スキーマ変更は `docs/sql/` 配下に SQL ファイルを追加し、Supabase ダッシュボードの SQL Editor で手動実行する運用です（`docs/sql/create_game_tables.sql` 等を参照）。

> `docs/sql/` のうち追跡対象はスキーマ定義（DDL）のみです。`data/` から生成した INSERT ダンプ（`insert_*.sql`、計約 9.8MB）は `.gitignore` で除外しているため、クローン直後には存在しません。DDL 以外の SQL を追加する場合は、追跡対象にするかを `.gitignore` で明示してください。

## 手順

1. `docs/sql/` に新しいマイグレーション用 SQL ファイルを追加する（既存ファイルは変更せず、新規ファイルとして追加する）
2. Supabase ダッシュボードの SQL Editor で内容を確認しながら実行する
3. スキーマ変更が `src/types/` の型定義に影響する場合は、あわせて更新する

## 注意事項

- 本番環境で実行する前に、必ずステージング環境またはローカルで動作確認する
- 破壊的な変更（列削除・型変更等）を行う前に、既存データのバックアップを取得する
- `SUPABASE_SERVICE_ROLE_KEY` 等のシークレットはコマンドやSQLファイルに直書きしない

Supabase CLI（`supabase migration new` 等）によるマイグレーション管理への移行は未検討です。導入する場合はユーザーに確認してください。
