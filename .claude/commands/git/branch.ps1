param(
    [Parameter(Mandatory=$true)]
    [string]$name
)

# Claude Code は出力を UTF-8 として読むため、stdout を UTF-8 に固定する（文字化け防止）
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

# ブランチ名の規則チェック（feature/ fix/ docs/ のみ許可）
if ($name -notmatch '^(feature|fix|docs)/.+') {
    Write-Host "ERROR: Branch name must match feature/<name>, fix/<name>, or docs/<name>." -ForegroundColor Red
    Write-Host "  See docs/git-rules.md for details." -ForegroundColor Red
    exit 1
}

git checkout -b $name
if (-not $?) {
    Write-Host "ERROR: Failed to create branch '$name'." -ForegroundColor Red
    exit 1
}

Write-Host "Created and switched to branch: $name" -ForegroundColor Green
