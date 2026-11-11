# V17 five-map panel runner (real, copy-pasteable; no backslash line continuation).
#
# Example (run from the repository root):
#   pwsh -NoProfile -ExecutionPolicy Bypass -File v17/scripts/run_panel_sharded.ps1 `
#       -Panel dev -ModelKey 'P1:s2026' -Model 'v16/out/v16_20260926_core/experiments/P1/s2026/P1_final.json'
#
# Teacher arm:
#   pwsh -NoProfile -ExecutionPolicy Bypass -File v17/scripts/run_panel_sharded.ps1 -Panel dev -Policy b100q -OutDir v17/out/v17_20260926_r2/teacher/arena
#
# Notes (kept ASCII on purpose: Windows PowerShell 5.1 reads BOM-less files as ANSI):
# - one process per map, exact --blocks, so wall time is roughly serial/5;
# - one output shard per map; shards never overwrite each other;
# - frozen caps are not touched (no --max-steps / --wall-ms passed).

param(
    [string]$RunId = 'v17_20260926_r2',
    [ValidateSet('dev', 'recheck', 'confirm')]
    [string]$Panel = 'dev',
    [ValidateSet('auto', 'model', 'h0', 'b100r', 'b100q')]
    [string]$Policy = 'auto',
    [string]$Model = '',
    [string]$ModelKey = '',
    [string]$OutDir = '',
    [string]$Tag = '',
    [switch]$AllowConfirm
)

$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
Set-Location $repo

$seedsPerMap = if ($Panel -eq 'recheck') { 4 } else { 2 }
$runRoot = "v17/out/$RunId"
if ([string]::IsNullOrEmpty($OutDir)) {
    $OutDir = if ($Policy -eq 'b100r' -or $Policy -eq 'b100q') { "$runRoot/teacher/arena" } else { "$runRoot/arena/$Panel" }
}
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
New-Item -ItemType Directory -Force -Path "$runRoot/logs" | Out-Null

$name = if ($Policy -eq 'b100r' -or $Policy -eq 'b100q') { $Policy } elseif ([string]::IsNullOrEmpty($ModelKey)) { 'h0' } else { $ModelKey }
$name = $name -replace '[:\\/]', '_'
if (-not [string]::IsNullOrEmpty($Tag)) { $name = "$name.$Tag" }

$procs = @()
for ($m = 0; $m -lt 5; $m++) {
    $blocks = @()
    for ($s = 0; $s -lt $seedsPerMap; $s++) { $blocks += "${Panel}:m${m}:s${s}" }
    $blockArg = ($blocks -join ',')
    $outFile = "$OutDir/$name.m$m.games.jsonl"
    $logFile = "$runRoot/logs/$name.m$m.panel.log"

    $argv = @(
        '--openssl-legacy-provider', 'v12/tools/run-tool.mjs', 'v17/tools/arena_run_v17.ts',
        '--run-id', $RunId, '--panel', $Panel, '--arms', 'candidate',
        '--policy', $Policy, '--blocks', $blockArg, '--out', $outFile
    )
    if (-not [string]::IsNullOrEmpty($Model)) { $argv += @('--model', $Model) }
    if (-not [string]::IsNullOrEmpty($ModelKey)) { $argv += @('--model-key', $ModelKey) }
    if ($Panel -eq 'confirm' -and $AllowConfirm) { $argv += @('--allow-confirm', 'true') }

    Write-Host "[run_panel] map m$m -> $outFile"
    $procs += Start-Process -FilePath 'node' -ArgumentList $argv -NoNewWindow -PassThru -RedirectStandardOutput $logFile -RedirectStandardError "$logFile.err"
}

# Wait-Process needs process-handle rights the sandbox denies, so poll HasExited instead.
$deadline = (Get-Date).AddHours(6)
while ($true) {
    $alive = @($procs | Where-Object { -not $_.HasExited })
    if ($alive.Count -eq 0) { break }
    if ((Get-Date) -gt $deadline) { Write-Warning '[run_panel] wait timeout (6h); reporting partial results.'; break }
    Start-Sleep -Seconds 15
}

# Success is judged by the ARTIFACTS, not by the process exit code: several parallel
# `run-tool.mjs` processes print "WebSocket server error: Port 24678 is already in use"
# for Vite's HMR socket and can exit non-zero even though every game was written.
# A shard counts as OK only if its progress file exists, failed == 0, and it wrote rows.
$summary = @()
$bad = 0
foreach ($m in 0..4) {
    $progress = "$OutDir/$name.m$m.progress.json"
    if (-not (Test-Path $progress)) {
        $summary += [pscustomobject]@{ shard = "m$m"; status = 'MISSING_PROGRESS'; rows = 0; failed = $null; wallSec = $null }
        $bad++
        continue
    }
    $j = Get-Content $progress -Raw | ConvertFrom-Json
    $status = if ($j.appendedRows -gt 0 -and $j.failed -eq 0) { 'OK' } else { 'CHECK' }
    if ($status -ne 'OK') { $bad++ }
    $summary += [pscustomobject]@{ shard = "m$m"; status = $status; rows = $j.appendedRows; failed = $j.failed; wallSec = [math]::Round($j.wallMs / 1000, 1) }
}
$summary | Format-Table -AutoSize | Out-String -Width 200 | Write-Host
Write-Host "[run_panel] panel=$Panel policy=$Policy name=$name procs=$($procs.Count) shardsNotOK=$bad (process exit codes are informational only)"
if ($bad -ne 0) { exit 1 }
