以下のコマンドを実行して開発サーバーを起動してください。
既にポート3000で開発サーバーが起動している場合は、そのプロセスを終了してから起動してください。

```powershell
$conn = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($conn) {
    $procId = $conn.OwningProcess
    Stop-Process -Id $procId -Force
    Write-Host "既存の開発サーバー (PID: $procId) を停止しました"
}
npm run dev
```
