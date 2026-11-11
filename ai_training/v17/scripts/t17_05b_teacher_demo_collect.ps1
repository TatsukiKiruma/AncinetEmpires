# V17/T17-05b: collect ON-POLICY teacher demonstration games (ASCII only).
#
# Plays B100-Q against frozen H0 on fresh roots and captures every decision state of the
# teacher's OWN trajectory, plus the action it actually played. This is the data for the
# B1e experiment: B1 supervised the teacher's opinion about states the teacher would never
# reach; B1e supervises only states the teacher actually visited.
#
# Roots: train namespace base 2610010000, rootIndex 10..12 (0..9 belong to the T17-01 pool),
# five maps, both seats => 30 games, sharded across 6 processes.
#
param(
    [string]$RunId = 'v17_20260926_r2',
    [int]$RootStart = 10,
    [int]$RootCount = 3,
    [int]$MaxRowsPerRoot = 400,
    [int]$Shards = 6
)

$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
Set-Location $repo
$run = "v17/out/$RunId"
New-Item -ItemType Directory -Force -Path "$run/logs" | Out-Null

$procs = @()
for ($i = 0; $i -lt $Shards; $i++) {
    $log = "$run/logs/t17_05b_demo.shard$i.log"
    $argv = @(
        '--openssl-legacy-provider', 'v12/tools/run-tool.mjs', 'v17/tools/collect_v17_teacher_demo.ts',
        '--run-id', $RunId, '--split', 'train', '--variant', 'B100-Q',
        '--root-start', "$RootStart", '--root-count', "$RootCount",
        '--max-rows-per-root', "$MaxRowsPerRoot", '--shard', "$i/$Shards", '--tag', 'demo'
    )
    Write-Host "[t17_05b] shard $i/$Shards starting"
    $procs += Start-Process -FilePath 'node' -ArgumentList $argv -NoNewWindow -PassThru -RedirectStandardOutput $log -RedirectStandardError "$log.err"
}

$deadline = (Get-Date).AddHours(3)
while ($true) {
    $alive = @($procs | Where-Object { -not $_.HasExited })
    if ($alive.Count -eq 0) { break }
    if ((Get-Date) -gt $deadline) { Write-Warning '[t17_05b] wait timeout (3h)'; break }
    Start-Sleep -Seconds 20
}

$files = Get-ChildItem "$run/data/demo_train/rollouts/*.demo.shard*.jsonl" -ErrorAction SilentlyContinue
$rows = 0
foreach ($f in $files) { $rows += (Get-Content $f.FullName | Measure-Object -Line).Lines }
Write-Host "[t17_05b] shards=$($files.Count) rows=$rows"
$files | Select-Object Name, Length | Format-Table -AutoSize | Out-String -Width 160 | Write-Host
