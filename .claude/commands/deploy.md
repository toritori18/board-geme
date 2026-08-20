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
2. 以下の環境変数が Vercel のプロジェクト設定（Environment Variables）に **Production 向けとして**登録されていること

   | 変数 | 未登録だとどうなるか |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | DB に接続できず全機能が停止する |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 同上 |
   | `SUPABASE_SERVICE_ROLE_KEY` | ログイン・レート制限が動作しない |
   | `SESSION_SECRET` | **ログインが必ず失敗する。** [session.ts](../../src/utils/session.ts) は未設定時に弱い既定値へフォールバックせず例外を投げるため、画面には「サーバーの設定が不足しているためログインできません。」と表示される |
   | `NEXT_PUBLIC_SITE_URL` | `http://localhost:3000` にフォールバックし、招待・パスワードリセットメールのリンクが本番で機能しなくなる |

   > `ANTHROPIC_API_KEY` は Vercel には**登録不要**です。参照しているのは `scripts/` 配下のシード処理（`npm run seed:*`）だけで、`src/` からは使用しません。

3. 環境変数を追加・変更した場合は、**保存したうえで Redeploy を実行すること**

   環境変数は「デプロイを作成した瞬間」の設定が固定されます。保存前に Redeploy を押しても反映されません。Vercel ダッシュボードの Deployments → 対象の Production デプロイ → 「…」 → Redeploy から実行します（`NEXT_PUBLIC_` 付きの変数はビルド時にコードへ埋め込まれるため、ビルドキャッシュは使わない方が確実です）。
