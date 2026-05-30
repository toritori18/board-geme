以下のコマンドを実行して開発サーバーを停止してください。

```powershell
$conn = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($conn) {
    $procId = $conn.OwningProcess
    Stop-Process -Id $procId -Force
    Write-Host "開発サーバー (PID: $procId) を停止しました"
} else {
    Write-Host "ポート3000で起動中のサーバーはありません"
}
```
