# 開発サーバーを起動する（既存プロセスがあれば停止してから、npm run dev をバックグラウンドで起動する）

# Claude Code は出力を UTF-8 として読むため、stdout を UTF-8 に固定する（文字化け防止）
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

# リポジトリのルートディレクトリ（呼び出し元のカレントディレクトリに依存しないよう $PSScriptRoot を基準に解決する）
$RepoRoot = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $PSScriptRoot))

$port = 3000

# 既存の開発サーバーがあれば停止する
$conn = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($conn) {
    $procId = $conn.OwningProcess
    Stop-Process -Id $procId -Force
    Write-Host "既存の開発サーバー (PID: $procId) を停止しました" -ForegroundColor Yellow

    # ポートが解放される前に新しいインスタンスを起動すると、後段の起動確認が古い待ち受けを拾って
    # 「起動成功」と誤判定するため、解放を待ってから起動する（最大10秒）
    $released = $false
    for ($i = 0; $i -lt 10; $i++) {
        if (-not (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue)) {
            $released = $true
            break
        }
        Start-Sleep -Seconds 1
    }
    if (-not $released) {
        Write-Host "ERROR: ポート $port が10秒以内に解放されませんでした。ポートを使用しているプロセスを手動で停止してから再実行してください。" -ForegroundColor Red
        exit 1
    }
}

# ログの出力先（.gitignore の logs/ で除外済み）。.claude/ は版管理する設定の置き場なので、
# 実行時の生成物であるログは logs/ に分ける
$logDir = Join-Path $RepoRoot "logs"
# Start-Process のリダイレクト先は、ディレクトリが無いと起動そのものが失敗するため先に作る
New-Item -ItemType Directory -Path $logDir -Force | Out-Null

$log = Join-Path $logDir "dev-server.log"
$errorLog = Join-Path $logDir "dev-server.err.log"
Remove-Item -LiteralPath $log, $errorLog -Force -ErrorAction SilentlyContinue

# バックグラウンドで起動する（フォアグラウンド実行だと呼び出し元のシェルがブロックされるため）
# npm は npm.cmd のためシェル経由で実行する
$proc = Start-Process -FilePath "cmd.exe" `
    -ArgumentList "/c", "npm run dev" `
    -WorkingDirectory $RepoRoot `
    -RedirectStandardOutput $log -RedirectStandardError $errorLog `
    -WindowStyle Hidden -PassThru

# 起動確認: 最大30秒待つ
$started = $false
for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Seconds 1
    if (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) {
        $started = $true
        break
    }
    if ($proc.HasExited) {
        break
    }
}

if ($started) {
    Write-Host "Dev server started: http://localhost:$port/ (log: $log)" -ForegroundColor Green
} else {
    Write-Host "ERROR: Dev server did not start. Last log lines:" -ForegroundColor Red
    if (Test-Path -LiteralPath $log) {
        Get-Content -LiteralPath $log -Tail 20
    }
    if ((Test-Path -LiteralPath $errorLog) -and (Get-Item -LiteralPath $errorLog).Length -gt 0) {
        Write-Host "--- stderr ($errorLog) ---" -ForegroundColor Red
        Get-Content -LiteralPath $errorLog -Tail 20
    }
    exit 1
}
