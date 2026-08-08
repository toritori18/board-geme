# /check（プッシュ前の総点検）の実体。
# verify-docs.ps1（ドキュメントの参照先検査）→ npm run lint（静的解析）
# → tsc --noEmit（型検査）→ npm run build（本番ビルド）の順に実行し、
# 途中で失敗したら後続を実行せず exit 1 する。
# check.md に4ステップを自然言語で並べる形にすると「1行目の失敗を無視して2行目が走る」問題が
# 起き得るため、スクリプト側で確実に止める。
#
# 自動テストは現状未導入のため、この総点検には含まれない（docs/tech-stack.md・test.md 参照）。

# Claude Code は出力を UTF-8 として読むため、stdout を UTF-8 に固定する（文字化け防止）
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

# このファイルは .claude/commands/ に置かれているため、2階層上がリポジトリルートになる。
# 呼び出し元のカレントディレクトリに依存させないため、npm / npx はここで解決した
# $RepoRoot をカレントディレクトリとして実行する。
$RepoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)

Write-Host "[1/4] ドキュメントの参照先を検査しています..." -ForegroundColor Cyan
& (Join-Path $PSScriptRoot 'verify-docs.ps1')
# $? と $LASTEXITCODE の両方を見て、呼び出した .ps1 の失敗を確実に止める。
if (-not $? -or $LASTEXITCODE -ne 0) {
    Write-Host "ERROR: ドキュメントの参照先検査に失敗しました。上記のログを確認してください。" -ForegroundColor Red
    exit 1
}

Write-Host "[2/4] 静的解析を実行しています..." -ForegroundColor Cyan
Push-Location -LiteralPath $RepoRoot
npm run lint
$lintSucceeded = $?
$lintExitCode = $LASTEXITCODE
Pop-Location
if (-not $lintSucceeded -or $lintExitCode -ne 0) {
    Write-Host "ERROR: 静的解析（npm run lint）に失敗しました。上記のログを確認してください。" -ForegroundColor Red
    exit 1
}

Write-Host "[3/4] 型検査を実行しています..." -ForegroundColor Cyan
Push-Location -LiteralPath $RepoRoot
npx tsc --noEmit
$tscSucceeded = $?
$tscExitCode = $LASTEXITCODE
Pop-Location
if (-not $tscSucceeded -or $tscExitCode -ne 0) {
    Write-Host "ERROR: 型検査（npx tsc --noEmit）に失敗しました。上記のログを確認してください。" -ForegroundColor Red
    exit 1
}

Write-Host "[4/4] 本番ビルドを実行しています..." -ForegroundColor Cyan
Push-Location -LiteralPath $RepoRoot
npm run build
$buildSucceeded = $?
$buildExitCode = $LASTEXITCODE
Pop-Location
if (-not $buildSucceeded -or $buildExitCode -ne 0) {
    Write-Host "ERROR: 本番ビルド（npm run build）に失敗しました。上記のログを確認してください。" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "OK: チェックが完了しました。プッシュ可能です。" -ForegroundColor Green
exit 0
