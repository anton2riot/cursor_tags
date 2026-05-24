# cursor_tags - install/update patch
# Idempotent: safe to run multiple times.

$ErrorActionPreference = 'Stop'

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$patchDir = Join-Path $scriptDir 'patch'

if (-not (Test-Path $patchDir)) {
    Write-Host "[cursor_tags] ERROR: patch\ folder not found next to install.ps1" -ForegroundColor Red
    exit 1
}

# 1. Find Cursor install
$candidates = @(
    "$env:LOCALAPPDATA\Programs\cursor\_\resources\app\out\vs\code\electron-sandbox\workbench",
    "$env:LOCALAPPDATA\Programs\cursor\resources\app\out\vs\code\electron-sandbox\workbench",
    "$env:ProgramFiles\cursor\_\resources\app\out\vs\code\electron-sandbox\workbench",
    "$env:ProgramFiles\cursor\resources\app\out\vs\code\electron-sandbox\workbench"
)
$workbenchDir = $null
foreach ($c in $candidates) {
    if (Test-Path (Join-Path $c 'workbench.html')) { $workbenchDir = $c; break }
}
if (-not $workbenchDir) {
    Write-Host "[cursor_tags] ERROR: Cursor install not found. Checked paths:" -ForegroundColor Red
    $candidates | ForEach-Object { Write-Host "  $_" }
    exit 1
}
Write-Host "[cursor_tags] Cursor found: $workbenchDir" -ForegroundColor Cyan

# 2. Copy patch/* into cursor-chat-labels/
$targetPatchDir = Join-Path $workbenchDir 'cursor-chat-labels'
if (-not (Test-Path $targetPatchDir)) {
    New-Item -ItemType Directory -Path $targetPatchDir -Force | Out-Null
}
Copy-Item -Path (Join-Path $patchDir '*') -Destination $targetPatchDir -Recurse -Force
Write-Host "[cursor_tags] Patch files copied to $targetPatchDir"

# 3. Idempotent <script> injection into workbench.html
$workbenchHtml = Join-Path $workbenchDir 'workbench.html'
$content = [System.IO.File]::ReadAllText($workbenchHtml, [System.Text.UTF8Encoding]::new($false))

# Strip any previous block
$content = [regex]::Replace($content, '(?s)\s*<!-- cursor-chat-labels:start -->.*?<!-- cursor-chat-labels:end -->\s*', "`r`n`t")

if ($content -notmatch '</head>') {
    Write-Host "[cursor_tags] ERROR: </head> not found in workbench.html" -ForegroundColor Red
    exit 1
}

$inject = "`r`n`t`t<!-- cursor-chat-labels:start -->`r`n`t`t<script src=`"./cursor-chat-labels/chat-labels.js`" type=`"module`"></script>`r`n`t`t<!-- cursor-chat-labels:end -->`r`n`t"
$content = $content -replace '</head>', "$inject</head>"

# UTF-8 without BOM (Cursor expects exact format)
[System.IO.File]::WriteAllText($workbenchHtml, $content, (New-Object System.Text.UTF8Encoding $false))
Write-Host "[cursor_tags] workbench.html updated"

# 4. Set up git hook (once)
if (Test-Path (Join-Path $scriptDir '.git')) {
    try {
        Push-Location $scriptDir
        $currentHooksPath = (git config --local core.hooksPath 2>$null)
        if ($currentHooksPath -ne '.githooks') {
            git config --local core.hooksPath '.githooks' | Out-Null
            Write-Host "[cursor_tags] git hooks enabled (core.hooksPath = .githooks)" -ForegroundColor Cyan
        }
        Pop-Location
    } catch {
        Write-Host "[cursor_tags] warn: could not configure git hooks: $_" -ForegroundColor Yellow
    }
}

# 5. Check if Cursor is running
$cursor = Get-Process -Name 'Cursor' -ErrorAction SilentlyContinue
if ($cursor) {
    Write-Host ""
    Write-Host "[cursor_tags] NOTE: Cursor is running. Restart it for the patch to activate." -ForegroundColor Yellow
} else {
    Write-Host ""
    Write-Host "[cursor_tags] Done. You can start Cursor now." -ForegroundColor Green
}
