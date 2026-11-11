# V17/T17-05d: collect student-visit rollouts on FRESH roots for the B2 arm (ASCII only).
#
# B2 (taskbook D2) = same total unique inputs as B0, but the composition is shifted toward
# STUDENT-VISITED states instead of H0 states. This is the arm that tests "does correcting
# on the policy's own distribution beat plain demonstration".
#
# Roots: train namespace base 2610010000, rootIndex 13..17. Roots 0..9 hold the T17-01 pool,
# 10..12 hold the B1e on-policy teacher demo, so 13.. is free.
param(
    [string]$RunId = 'v17_20260926_r2',
    [int]$RootStart = 13,
    [int]$RootCount = 5,
    [int]$MaxRowsPerRoot = 300,
    [string]$Candidate = 'v16/out/v16_20260926_core/experiments/P1/s2026/P1_final.json',
    [int]$Shards = 5
)

$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
Set-Location $repo
$run = "v17/out/$RunId"
New-Item -ItemType Directory -Force -Path "$run/logs" | Out-Null

$procs = @()
for ($m = 0; $m -lt 5; $m++) {
    $log = "$run/logs/t17_05d_student.m$m.log"
    # IMPORTANT: collect_v17_rollouts.ts builds its output name from
    # (split, source, tag, shard) - NOT from --map-index. Giving every map the same tag made
    # all five processes write the SAME file with flags:'w' and interleave their lines.
    # Each map therefore gets its own tag.
    $argv = @(
        '--openssl-legacy-provider', 'v12/tools/run-tool.mjs', 'v17/tools/collect_v17_rollouts.ts',
        '--run-id', $RunId, '--split', 'train', '--source', 'student',
        '--candidate', $Candidate,
        '--root-start', "$RootStart", '--root-count', "$RootCount",
        '--map-index', "$m", '--max-rows-per-root', "$MaxRowsPerRoot", '--tag', "b2m$m"
    )
    Write-Host "[t17_05d] map m$m starting"
    $procs += Start-Process -FilePath 'node' -ArgumentList $argv -NoNewWindow -PassThru `
        -RedirectStandardOutput $log -RedirectStandardError "$log.err"
}

$deadline = (Get-Date).AddHours(3)
while ($true) {
    $alive = @($procs | Where-Object { -not $_.HasExited })
    if ($alive.Count -eq 0) { break }
    if ((Get-Date) -gt $deadline) { Write-Warning '[t17_05d] wait timeout (3h)'; break }
    Start-Sleep -Seconds 20
}

$files = Get-ChildItem "$run/data/new_train/rollouts/*student*.b2m*.jsonl" -ErrorAction SilentlyContinue
$rows = 0
foreach ($f in $files) { $rows += (Get-Content $f.FullName | Measure-Object -Line).Lines }
Write-Host "[t17_05d] student rollout files=$($files.Count) rows=$rows"
$files | Select-Object Name, Length | Format-Table -AutoSize | Out-String -Width 160 | Write-Host
