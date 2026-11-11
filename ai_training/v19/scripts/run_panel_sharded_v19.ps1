# V19 五图对局面板执行器（分片：每图一个进程、一个输出分片）。
#
# 与 v18/scripts/run_panel_sharded_v18.ps1 相同做法，只把输出根目录改到 v19/out/<RunId>，
# 不写任何 v14–v18 产物。面板定义、seed 公式、caps 全部沿用 v16/tools/eval_v16_protocol.ts
# 的冻结常量（DEV20 baseSeed=2609260100，seedsPerMap=2；CONFIRM20 baseSeed=2609260300），
# 本脚本不重新定义面板。
#
# 用法（仓库根目录）：
#   pwsh -NoProfile -ExecutionPolicy Bypass -File v19/scripts/run_panel_sharded_v19.ps1 `
#       -RunId run_20260928_v19_01 -Panel dev `
#       -ModelKey 'U_best' -Model 'v18/out/run_20260927_v18_01/experiments/T18_04_w1_U/U_best.json'
#
# 成功以**产物**判定，不以进程退出码判定（并行 run-tool 会打印 Vite HMR 端口告警）。
param(
    [string]$RunId = 'run_20260928_v19_01',
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
$runRoot = "v19/out/$RunId"
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
        '--run-id', $RunId, '--run-root', $runRoot, '--panel', $Panel, '--arms', 'candidate',
        '--policy', $Policy, '--blocks', $blockArg, '--out', $outFile
    )
    if (-not [string]::IsNullOrEmpty($Model)) { $argv += @('--model', $Model) }
    if (-not [string]::IsNullOrEmpty($ModelKey)) { $argv += @('--model-key', $ModelKey) }
    if ($Panel -eq 'confirm' -and $AllowConfirm) { $argv += @('--allow-confirm', 'true') }

    Write-Host "[run_panel_v19] panel=$Panel name=$name map m$m -> $outFile"
    $procs += Start-Process -FilePath 'node' -ArgumentList $argv -NoNewWindow -PassThru -RedirectStandardOutput $logFile -RedirectStandardError "$logFile.err"
}

$deadline = (Get-Date).AddHours(6)
while ($true) {
    $alive = @($procs | Where-Object { -not $_.HasExited })
    if ($alive.Count -eq 0) { break }
    if ((Get-Date) -gt $deadline) { Write-Warning '[run_panel_v19] wait timeout (6h); reporting partial results.'; break }
    Start-Sleep -Seconds 15
}

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
Write-Host "[run_panel_v19] panel=$Panel name=$name shardsNotOK=$bad (process exit codes are informational only)"
if ($bad -ne 0) { exit 1 }
