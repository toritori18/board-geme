# セッション開始時チェック：必須項目が未入力の場合にClaudeへ通知する

# Claude Code は出力を UTF-8 として読むため、stdout を UTF-8 に固定する（文字化け防止）
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$missing = @()

# README.md チェック
if (-not (Test-Path "README.md")) {
    $missing += "・README.md が存在しません。プロジェクト概要を記載してください。"
} elseif (Select-String -Path "README.md" -Pattern "\{\{" -Quiet) {
    $missing += "・README.md にプレースホルダーが残っています。プロジェクト情報を入力してください。"
}

# 技術スタック チェック
if (-not (Test-Path "docs/tech-stack.md")) {
    $missing += "・docs/tech-stack.md が存在しません。技術スタックを記載してください。"
} elseif (Select-String -Path "docs/tech-stack.md" -Pattern "\{\{例:" -Quiet) {
    $missing += "・docs/tech-stack.md の技術スタックが未入力です。プレースホルダーを実際の技術に書き換えてください。"
}

# コントリビュートガイド チェック
if ((Test-Path "docs/contributing.md") -and (Select-String -Path "docs/contributing.md" -Pattern "\{\{" -Quiet)) {
    $missing += "・docs/contributing.md にプレースホルダーが残っています。プロジェクトの規約に合わせて書き換えてください。"
}

# git リポジトリ チェック（未初期化だと Git 系コマンド・フックが動作しない）
if (-not (Test-Path ".git")) {
    $missing += "・git リポジトリが未初期化です。/git:init を実行してください（git init と git hooks の登録が行われます）。"
}

if ($missing.Count -gt 0) {
    $list = $missing -join "`n"
    $message = "作業を始める前に以下を設定してください:`n$list"
    $json = [PSCustomObject]@{
        hookSpecificOutput = [PSCustomObject]@{
            hookEventName   = "SessionStart"
            additionalContext = $message
        }
    } | ConvertTo-Json -Compress
    Write-Output $json
}
