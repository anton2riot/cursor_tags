# cursor_tags - remove patch
$ErrorActionPreference = 'Stop'

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
    Write-Host "[cursor_tags] Cursor install not found" -ForegroundColor Red
    exit 1
}

$workbenchHtml = Join-Path $workbenchDir 'workbench.html'
$content = [System.IO.File]::ReadAllText($workbenchHtml, [System.Text.UTF8Encoding]::new($false))
$content = [regex]::Replace($content, '(?s)\s*<!-- cursor-chat-labels:start -->.*?<!-- cursor-chat-labels:end -->\s*', "`r`n`t")
[System.IO.File]::WriteAllText($workbenchHtml, $content, (New-Object System.Text.UTF8Encoding $false))
Write-Host "[cursor_tags] inject removed from workbench.html" -ForegroundColor Cyan

$targetPatchDir = Join-Path $workbenchDir 'cursor-chat-labels'
if (Test-Path $targetPatchDir) {
    Remove-Item -Path $targetPatchDir -Recurse -Force
    Write-Host "[cursor_tags] removed $targetPatchDir" -ForegroundColor Cyan
}

Write-Host "[cursor_tags] Done. Restart Cursor." -ForegroundColor Green
