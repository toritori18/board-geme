param(
    # 既定は一覧表示のみ。削除は明示的に指定された場合しか行わない。
    # git/merge.md の「ブランチ削除はユーザーに確認してから別途行う」という方針に合わせ、
    # 引数なしで呼び出された場合に削除が起きないことをスクリプト側で保証する。
    [ValidateSet("None", "Local", "LocalAndRemote")]
    [string]$Delete = "None"
)

# Claude Code は出力を UTF-8 として読むため、stdout を UTF-8 に固定する（文字化け防止）
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

# git リポジトリでなければ中止する（/git:init 前の状態）
$null = git rev-parse --git-dir 2>$null
if (-not $?) {
    Write-Host "ERROR: Not a git repository. Run /git:init first." -ForegroundColor Red
    exit 1
}

# マージ済み判定の基準を決める。
# 本プロジェクトは /git:merge が GitHub 上でマージするため、ローカルの main は
# 誰かが明示的に pull しない限り更新されず古いままになりやすい。
# 古い main を基準にすると、実際にはマージ済みのブランチが一覧から漏れる。
# そのため origin/main を優先し、無い場合のみローカル main にフォールバックする。
$baseRef = $null
git show-ref --verify --quiet refs/remotes/origin/main
if ($?) {
    $baseRef = "origin/main"
}
else {
    git show-ref --verify --quiet refs/heads/main
    if (-not $?) {
        Write-Host "ERROR: Neither 'origin/main' nor local 'main' was found. Cannot determine merged branches." -ForegroundColor Red
        exit 1
    }
    $baseRef = "main"
    Write-Host "WARNING: 'origin/main' not found. Falling back to local 'main'." -ForegroundColor Yellow
}

$current = git rev-parse --abbrev-ref HEAD

# 基準ブランチにマージ済みのローカルブランチを列挙する。
# git branch --merged の出力には、現在のブランチに '*'、別のワークツリーで
# チェックアウト中のブランチに '+' が付くため、記号と空白を除去してから比較する。
$merged = @(
    git branch --merged $baseRef |
        ForEach-Object { $_.TrimStart('*', '+', ' ').Trim() } |
        Where-Object { $_ -ne 'main' -and $_ -ne $current -and $_ -ne '' }
)

if ($merged.Count -eq 0) {
    Write-Host "No merged branches to clean up." -ForegroundColor Green
    Write-Host "  (Excluded: main, current branch '$current')"
    exit 0
}

# リモート追跡ブランチの一覧。'origin/HEAD -> origin/main' のような記号参照の行は除外する。
$remotes = @(
    git branch -r |
        ForEach-Object { $_.Trim() } |
        Where-Object { $_ -notmatch '->' }
)

# --- 一覧表示のみ（既定） ---
if ($Delete -eq "None") {
    Write-Host "Merged branches ($($merged.Count)):" -ForegroundColor Cyan
    foreach ($branch in $merged) {
        if ($remotes -contains "origin/$branch") {
            Write-Host ("  {0,-45} (origin にも存在)" -f $branch)
        }
        else {
            Write-Host ("  {0,-45} (ローカルのみ)" -f $branch)
        }
    }
    Write-Host ""
    Write-Host "Base: $baseRef  /  Excluded: main, current branch '$current'"
    # origin/main は最後に fetch した時点の内容であり、実際のリモートより古い可能性がある
    Write-Host "  (Run 'git fetch origin' first if the list looks incomplete.)"
    Write-Host "Nothing was deleted. To delete, re-run with -Delete Local or -Delete LocalAndRemote." -ForegroundColor Yellow
    exit 0
}

# --- 削除 ---
$failed = 0
foreach ($branch in $merged) {
    # -d はマージ済みブランチしか削除しない（-D による強制削除は行わない）
    git branch -d $branch
    if (-not $?) {
        Write-Host "WARNING: Failed to delete local branch '$branch'." -ForegroundColor Yellow
        $failed++
        continue
    }

    if ($Delete -eq "LocalAndRemote" -and $remotes -contains "origin/$branch") {
        git push origin --delete $branch
        if (-not $?) {
            Write-Host "WARNING: Failed to delete remote branch 'origin/$branch'." -ForegroundColor Yellow
            $failed++
        }
    }
}

if ($failed -gt 0) {
    Write-Host "Finished with $failed failure(s)." -ForegroundColor Yellow
    exit 1
}

Write-Host "Deleted $($merged.Count) merged branch(es)." -ForegroundColor Green
