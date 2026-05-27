# 初回セットアップスクリプト

Write-Host "=== Board Game Ranking セットアップ ===" -ForegroundColor Cyan

# Node.js バージョン確認
Write-Host "`n[1/3] Node.js バージョン確認..."
node --version
if (-not $?) {
    Write-Host "ERROR: Node.js がインストールされていません。https://nodejs.org からインストールしてください。" -ForegroundColor Red
    exit 1
}

# 依存パッケージのインストール
Write-Host "`n[2/3] 依存パッケージをインストール中..."
npm install
if (-not $?) {
    Write-Host "ERROR: npm install に失敗しました。" -ForegroundColor Red
    exit 1
}

# 環境変数ファイルの作成
Write-Host "`n[3/3] 環境変数ファイルを作成中..."
if (Test-Path ".env.local") {
    Write-Host ".env.local はすでに存在します。スキップします。" -ForegroundColor Yellow
} else {
    Copy-Item ".env.example" ".env.local"
    Write-Host ".env.local を作成しました。Supabase の接続情報を設定してください。" -ForegroundColor Green
}

Write-Host "`n=== セットアップ完了 ===" -ForegroundColor Cyan
Write-Host "次のステップ:" -ForegroundColor White
Write-Host "  1. .env.local を編集して Supabase の接続情報を設定"
Write-Host "  2. npm run dev で開発サーバーを起動"
Write-Host "  3. ブラウザで http://localhost:3000 を開く"
