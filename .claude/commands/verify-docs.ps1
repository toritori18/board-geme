# ドキュメント（.md）の記述が実体とずれていないかを機械的に検査する。
# /check（check.ps1）から呼ばれる。
#
# 検査するのは「実体を見れば決定的に判定できる」ものだけである。
#   1. 相対リンクのリンク先ファイルが実在するか
#   2. .md へのリンクに付いたアンカー（#見出し）が実在する見出しか
#   3. 言及されているスラッシュコマンド（/xxx・/ns:xxx）が .claude/commands/ に実在するか
#
# 本プロジェクトは Windows PowerShell 5.1（Desktop エディション）から非対話で実行される
# （docs/powershell-contributing.md の「実行環境」参照）。
#
# --- この検査の限界（code-reviewer エージェントのレビューで補う想定） ---
# - 意味的な矛盾は検出できない。「/git:push は main ではブロックされる」のような挙動の記述が
#   実際のスクリプトの処理内容と食い違っていても、リンクとコマンド名が正しければ通ってしまう
# - 使われなくなった規約（ブランチ命名規則など、記述はあるが誰も従っていないもの）は検出できない
# - 例文の陳腐化（別プロジェクト由来のサンプルが残っている等）は検出できない
# - アンカーの照合は GitHub の見出しスラッグ生成規則の近似実装である（下記 ConvertTo-HeadingSlug 参照）

# Claude Code は出力を UTF-8 として読むため、stdout を UTF-8 に固定する（文字化け防止）
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

# このファイルは .claude/commands/ に置かれているため、2階層上がリポジトリルートになる。
# 呼び出し元のカレントディレクトリに依存させないため、$PSScriptRoot を基準に解決する。
$RepoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$CommandsRoot = Join-Path $RepoRoot '.claude\commands'

if (-not (Test-Path -LiteralPath $CommandsRoot)) {
    Write-Host "ERROR: コマンドディレクトリが見つかりません（$CommandsRoot）。" -ForegroundColor Red
    exit 1
}

<#
.SYNOPSIS
    見出し文字列を GitHub のアンカー（#リンク）形式のスラッグに変換する。
.DESCRIPTION
    GitHub の規則（小文字化 → 記号の除去 → 空白をハイフンに変換）を近似したもの。
    見出しに含まれる装飾（`code`・**強調**・[リンク](url)）は、アンカーには残らないため先に取り除く。
    日本語はそのまま残る（\p{L} が CJK を含むため）。

    近似であるため、以下は再現していない。該当する見出しへのリンクは誤検知になりうる。
    - 同名見出しが複数ある場合に GitHub が付ける連番サフィックス（-1・-2 …）
    - 絵文字を含む見出し
#>
function ConvertTo-HeadingSlug {
    param(
        [Parameter(Mandatory = $true)]
        [AllowEmptyString()]
        [string] $Heading
    )

    $slug = $Heading.Trim().ToLowerInvariant()
    # [表示テキスト](url) → 表示テキスト（アンカーに残るのは表示テキストのみ）
    $slug = $slug -replace '\[([^\]]*)\]\([^)]*\)', '$1'
    $slug = $slug -replace '`', ''
    $slug = $slug -replace '\*', ''
    # 文字・数字・アンダースコア・ハイフン・空白以外（全角括弧や読点を含む）を落とす
    $slug = $slug -replace '[^\p{L}\p{N}_\- ]', ''
    $slug = $slug -replace ' ', '-'

    return $slug
}

<#
.SYNOPSIS
    .md ファイルから、フェンス（```）で囲まれたコードブロック外にある見出しのスラッグ一覧を返す。
.DESCRIPTION
    コードブロック内の `# コメント` を見出しと誤認しないよう、フェンスの内側は読み飛ばす。
#>
function Get-HeadingSlugSet {
    param(
        [Parameter(Mandatory = $true)]
        [string] $FilePath
    )

    $slugs = @{}
    $inFence = $false

    # BOM なしの UTF-8 ファイルを指定なしで読むと、Windows PowerShell 5.1 は既定の
    # ANSI コードページ（日本語環境では CP932）として読んでしまい、日本語部分の解釈が
    # ずれて行が消えることがある（docs/powershell-contributing.md の「ファイル形式」参照）。
    foreach ($line in (Get-Content -LiteralPath $FilePath -Encoding UTF8)) {
        if ($line -match '^\s*```') {
            $inFence = -not $inFence
            continue
        }
        if ($inFence) {
            continue
        }
        if ($line -match '^#{1,6}\s+(.+?)\s*$') {
            $slugs[(ConvertTo-HeadingSlug -Heading $Matches[1])] = $true
        }
    }

    return $slugs
}

Write-Host "ドキュメントの参照先を検査しています..." -ForegroundColor Cyan

# 検査対象は git の追跡対象の .md に限る。.gitignore 対象（docs/sql/ 配下等）は
# ls-files が返さないため、自動的に対象外になる。
# core.quotepath=false を指定しないと、日本語を含むパスが \343\202... 形式でクォートされて返る。
$allMarkdown = git -C $RepoRoot -c core.quotepath=false ls-files '*.md'
if (-not $?) {
    Write-Host "ERROR: git ls-files の実行に失敗しました。" -ForegroundColor Red
    exit 1
}

# ドキュメントではないものを除く。
#   tests/ 配下 … テスト用フィクスチャ置き場（現状 .gitkeep のみだが、将来追加される想定）
$targets = @($allMarkdown | Where-Object {
    $_ -notlike 'tests/*'
})

if ($targets.Count -eq 0) {
    Write-Host "ERROR: 検査対象の .md が1件も見つかりませんでした。" -ForegroundColor Red
    exit 1
}

# 実在するスラッシュコマンド名を .claude/commands/ 配下の .md から導出する。
# サブフォルダが ':' 区切りの名前空間になる（例: git/pr.md → /git:pr）。
$knownCommands = @{}
$commandFiles = git -C $RepoRoot -c core.quotepath=false ls-files '.claude/commands/*.md'
if (-not $?) {
    Write-Host "ERROR: git ls-files の実行に失敗しました。" -ForegroundColor Red
    exit 1
}
foreach ($commandFile in $commandFiles) {
    $name = $commandFile -replace '^\.claude/commands/', '' -replace '\.md$', ''
    $knownCommands['/' + ($name -replace '/', ':')] = $true
}

if ($knownCommands.Count -eq 0) {
    Write-Host "ERROR: .claude/commands/ からコマンドを1件も検出できませんでした。" -ForegroundColor Red
    exit 1
}

# 見出しスラッグは複数のファイルから参照されうるため、先に全ファイル分を集めておく。
$headingSets = @{}
foreach ($relativePath in $targets) {
    $fullPath = Join-Path $RepoRoot ($relativePath -replace '/', '\')
    $headingSets[$relativePath] = Get-HeadingSlugSet -FilePath $fullPath
}

$brokenLinks = New-Object System.Collections.Generic.List[string]
$brokenAnchors = New-Object System.Collections.Generic.List[string]
$unknownCommands = New-Object System.Collections.Generic.List[string]
$linkCount = 0
$commandRefCount = 0

foreach ($relativePath in $targets) {
    $fullPath = Join-Path $RepoRoot ($relativePath -replace '/', '\')
    $fileDir = Split-Path -Parent $fullPath
    $lines = Get-Content -LiteralPath $fullPath -Encoding UTF8

    for ($i = 0; $i -lt $lines.Count; $i++) {
        $line = $lines[$i]
        $lineNumber = $i + 1

        # --- 1/2. Markdown リンク [表示テキスト](リンク先) ---
        foreach ($match in [regex]::Matches($line, '\[(?<text>[^\]]*)\]\((?<url>[^)\s]+)\)')) {
            $url = $match.Groups['url'].Value.Trim()
            # 外部 URL とページ内アンカーは対象外（実体を持たない、または同一ファイル内）
            if ($url -match '^(https?:|mailto:|#)') {
                continue
            }

            $urlParts = $url -split '#', 2
            $linkPath = $urlParts[0]
            if ([string]::IsNullOrWhiteSpace($linkPath)) {
                continue
            }

            $linkCount++
            # リンク先の実在は git の追跡状態ではなく Test-Path（ディスク上の実在）で判定する。
            # 注意: そのため .gitignore 対象（docs/sql/ 配下等）へのリンクは、手元では
            # 実体があるので通るが、CI のクリーンなチェックアウトでは存在せず落ちる。
            # 追跡対象の .md から docs/sql/ 配下へリンクを張らないこと。
            $resolvedPath = Join-Path $fileDir ($linkPath -replace '/', '\')
            if (-not (Test-Path -LiteralPath $resolvedPath)) {
                $brokenLinks.Add("$relativePath`:$lineNumber  $url")
                continue
            }

            if ($urlParts.Count -ne 2) {
                continue
            }

            $anchor = $urlParts[1]
            # #L42 / #L42-L51 は GitHub の行番号リンク。見出しではないため照合しない
            if ($anchor -match '^L\d+') {
                continue
            }
            if ($linkPath -notlike '*.md') {
                continue
            }

            $targetRelative = (Resolve-Path -LiteralPath $resolvedPath).Path.Substring($RepoRoot.Length + 1) -replace '\\', '/'
            # 検査対象外のファイル（tests/ 配下等）へのリンクは見出しを集めていないため照合しない
            if (-not $headingSets.ContainsKey($targetRelative)) {
                continue
            }
            if (-not $headingSets[$targetRelative].ContainsKey($anchor.ToLowerInvariant())) {
                $brokenAnchors.Add("$relativePath`:$lineNumber  $url")
            }
        }

        # --- 3. スラッシュコマンドへの言及 ---
        # 前後の除外条件で、コマンド以外の「/」を含む表記を弾いている。
        #   (?<![<\w./:-]) … src/pages/api/... のようなファイルパス途中の「/」を除外
        #   (?![\w:/=-])   … https://.../api/embed のような URL パス途中の「/」を除外
        # コマンド名は小文字始まりに限る（`/ranking` のようなアプリの画面パスは、
        # ファイルパスや URL の一部として書かれる限り直前が英数字になるため誤検知しない）。
        foreach ($match in [regex]::Matches($line, '(?<![<\w./:-])/(?<name>[a-z][a-z0-9-]*(?::[a-z][a-z0-9-]*)?)(?![\w:/=-])')) {
            $commandRefCount++
            $commandName = '/' + $match.Groups['name'].Value
            if (-not $knownCommands.ContainsKey($commandName)) {
                $unknownCommands.Add("$relativePath`:$lineNumber  $commandName")
            }
        }
    }
}

$hasError = $false

if ($brokenLinks.Count -gt 0) {
    $hasError = $true
    Write-Host ""
    Write-Host "ERROR: 以下の $($brokenLinks.Count) 件はリンク先のファイルが実在しません:" -ForegroundColor Red
    foreach ($entry in ($brokenLinks | Sort-Object)) {
        Write-Host "  - $entry" -ForegroundColor Red
    }
    Write-Host "  対応方法: リンク先のパスを修正するか、ファイルが移動・削除されたのであれば該当の記述を更新してください。" -ForegroundColor Red
}

if ($brokenAnchors.Count -gt 0) {
    $hasError = $true
    Write-Host ""
    Write-Host "ERROR: 以下の $($brokenAnchors.Count) 件はリンク先に該当する見出しがありません:" -ForegroundColor Red
    foreach ($entry in ($brokenAnchors | Sort-Object)) {
        Write-Host "  - $entry" -ForegroundColor Red
    }
    Write-Host "  対応方法: 見出しが改名・削除されていないか確認し、アンカー（# 以降）を実際の見出しに合わせてください。" -ForegroundColor Red
}

if ($unknownCommands.Count -gt 0) {
    $hasError = $true
    Write-Host ""
    Write-Host "ERROR: 以下の $($unknownCommands.Count) 件は .claude/commands/ に実在しないコマンドを参照しています:" -ForegroundColor Red
    foreach ($entry in ($unknownCommands | Sort-Object)) {
        Write-Host "  - $entry" -ForegroundColor Red
    }
    Write-Host "  対応方法: コマンドが改名・削除されていないか確認し、記述を実在するコマンド名に修正してください。" -ForegroundColor Red
}

if ($hasError) {
    exit 1
}

Write-Host ""
Write-Host "OK: $($targets.Count) ファイルを検査しました（リンク $linkCount 件、コマンド参照 $commandRefCount 件、実在コマンド $($knownCommands.Count) 件）。参照先はすべて実在します。" -ForegroundColor Green
exit 0
