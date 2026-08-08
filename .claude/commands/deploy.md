本番環境へのデプロイを行います。

## 自動デプロイ（推奨）

`main` への直接プッシュは禁止です（[docs/git-rules.md](../../docs/git-rules.md)）。**PR 経由で main にマージ**すると、Vercel が自動的にデプロイします（Vercel の GitHub 連携が設定済みであることが前提です。未設定の場合は Vercel ダッシュボードでリポジトリを Import してください）。

1. デプロイ前チェックリスト（下記）を確認する
2. 作業ブランチの変更をコミット・プッシュする: `/git:push "feat: 変更内容"`
3. PR を作成する: `/git:pr`
4. PR の内容を確認して main へマージする: `/git:merge` → Vercel が自動デプロイ

## デプロイ前チェックリスト

デプロイ前に以下を確認してください:

1. `/check` が通ること（ドキュメント参照先検査・lint・型検査・本番ビルドの一括実行）
2. `.env.local` に設定しているシークレット（`NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` / `ANTHROPIC_API_KEY`）が Vercel のプロジェクト設定（Environment Variables）にも登録されていること
