以下のスクリプトを実行して初回セットアップを行ってください。

```powershell
.\.claude\commands\setup.ps1
```

git hooks（push前の機密情報チェック）の登録はこのスクリプトには含まれません。別コマンド `/git:init` で行ってください。

セットアップ完了後、以下を案内してください:

1. .env.local に Supabase の接続情報を設定すること
2. git hooksの登録は `/git:init` コマンドで行うこと
