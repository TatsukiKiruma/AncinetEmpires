# V19/T19-00.3：按真实 optimizer update 保存检查点的**小规模可核算验证**。
#
# 目的（对应 V18 复核 §2.3）：
#   旧实现在 epoch 结束时比较 `consumption.updates == 保存点`，保存点落在 epoch 中间就永远
#   不命中的，1k/2k 因此从未产出。本脚本用 12 行真实训练输入、batch=4（每 epoch 恰 3 次更新）、
#   保存点 3/5/7 构造「跨 epoch 且含 epoch 中点」的场景，并做两项独立核对：
#     1) 命中：.u3/.u5/.u7 三个文件都产出，SHA 与 metrics.json 记录一致，且三者互不相同；
#     2) 等价：把 global-update-limit 直接设成 3/5/7 各跑一次，其 final 权重 SHA 必须与
#        对应的 .uN 完全一致 —— 这才证明「保存的是第 N 次真实更新后的权重」，
#        而不只是「有个文件写出来了」。
#   LR 用 constant，保证不同 limit 的调度不会改变权重，等价性核对才成立。
#
# 用法（仓库根目录）：
#   pwsh -NoProfile -ExecutionPolicy Bypass -File v19/scripts/t19_00_checkpoint_hook_smoke.ps1
param(
    [string]$RunId = 'run_20260928_v19_01',
    [int]$Rows = 12,
    [int]$BatchSize = 4,
    [int]$Epochs = 4,
    [string]$SavePoints = '3,5,7'
)
$ErrorActionPreference = 'Stop'
$py = 'C:\Users\SHIINA\AppData\Local\Programs\Python\Python312\python.exe'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
Set-Location $repo
$env:PYTHONIOENCODING = 'utf-8'

$runRoot = "v19/out/$RunId"
$smokeOut = "$runRoot/hook_smoke"
$dataDir = "$smokeOut/data"
# 训练器拒绝覆盖已存在的 optimizer ledger（这是正确的保护），因此本冒烟测试
# 每次从干净的 v19 自己的输出目录开始；不触碰 v14–v18 的任何产物。
if (Test-Path $smokeOut) { Remove-Item -Recurse -Force $smokeOut }
New-Item -ItemType Directory -Force -Path $dataDir | Out-Null
New-Item -ItemType Directory -Force -Path "$smokeOut/logs" | Out-Null

$srcDataset = 'v17/out/v17_20260926_r2/experiments/_data/B0_trainval.jsonl'
$smokeDataset = "$dataDir/smoke_train_only.jsonl"

# 1) 只取前 N 行构造小数据集（不改动源数据）。
$reader = [System.IO.File]::OpenText((Resolve-Path $srcDataset).Path)
$lines = New-Object System.Collections.Generic.List[string]
for ($i = 0; $i -lt $Rows; $i++) {
    $line = $reader.ReadLine()
    if ($null -eq $line) { break }
    $lines.Add($line)
}
$reader.Close()
[System.IO.File]::WriteAllLines((Join-Path (Get-Location) $smokeDataset), $lines, (New-Object System.Text.UTF8Encoding($false)))
Write-Output "[hook-smoke] dataset rows=$($lines.Count) -> $smokeDataset"

$schema = 'spatial26_global20_actionSemantics53_v15'
$trainer = 'v17/tools/train_v17.py'

function Invoke-HookSmoke {
    param([string]$Tag, [int]$Limit, [string]$SaveAt)
    $out = "$smokeOut/$Tag"
    New-Item -ItemType Directory -Force -Path $out | Out-Null
    $argv = @(
        $trainer,
        '--dataset', $smokeDataset,
        '--train-only',
        '--epochs', "$Epochs",
        '--global-update-limit', "$Limit",
        '--batch-size', "$BatchSize",
        '--lr', '1e-3',
        '--lr-schedule', 'constant',
        '--lr-schedule-unit', 'update',
        '--lr-total-updates', "$Limit",
        '--num-blocks', '2',
        '--spatial-channels', '26',
        '--encoder-schema-id', $schema,
        '--seed', '42',
        '--data-order-seed', '314159',
        '--value-weight', '0.0',
        '--out-model', "$out/${Tag}_best.json",
        '--out-last-model', "$out/${Tag}_last.json",
        '--out-final-model', "$out/${Tag}_final.json",
        '--out-metrics', "$out/metrics.json",
        '--out-state', "$out/train_state.pt",
        '--optimized-manifest', "$out/optimized_samples_manifest.json"
    )
    if (-not [string]::IsNullOrEmpty($SaveAt)) { $argv += @('--save-at-updates', $SaveAt) }
    & $py @argv *> "$out/run.log"
    if ($LASTEXITCODE -ne 0) { throw "[hook-smoke] trainer failed for tag=$Tag (exit=$LASTEXITCODE); see $out/run.log" }
    return $out
}

# 2) 主运行：一次跑 9 次更新，保存点 3/5/7（跨 epoch，且 5 落在 epoch 中点）。
$mainOut = Invoke-HookSmoke -Tag 'A_limit9' -Limit 9 -SaveAt $SavePoints

# 3) 等价运行：limit 分别正好停在 3/5/7。
$eqOuts = @{}
foreach ($p in ($SavePoints -split ',')) {
    $pt = [int]$p.Trim()
    $eqOuts[$pt] = Invoke-HookSmoke -Tag "B_limit$pt" -Limit $pt -SaveAt ''
}

# 4) 核对。
$sha = { param($path) if (Test-Path $path) { (Get-FileHash $path -Algorithm SHA256).Hash.ToLower() } else { $null } }
$metrics = Get-Content "$mainOut/metrics.json" -Raw | ConvertFrom-Json
$recorded = @{}
foreach ($item in $metrics.artifacts.intermediate) { $recorded[[int]$item.updates] = $item.sha256 }

$checks = @()
$fail = 0
foreach ($p in ($SavePoints -split ',')) {
    $pt = [int]$p.Trim()
    $file = "$mainOut/A_limit9_best.u$pt.json"
    $fileSha = & $sha $file
    $eqSha = & $sha "$($eqOuts[$pt])/B_limit$pt`_final.json"
    $recSha = $recorded[$pt]
    $exists = [bool]$fileSha
    $matchRecorded = ($fileSha -and $recSha -and ($fileSha -eq $recSha))
    $matchEquivalent = ($fileSha -and $eqSha -and ($fileSha -eq $eqSha))
    if (-not ($exists -and $matchRecorded -and $matchEquivalent)) { $fail++ }
    $checks += [pscustomobject]@{
        savePoint   = $pt
        fileExists  = $exists
        sha         = if ($fileSha) { $fileSha.Substring(0, 16) } else { $null }
        metricsSha  = if ($recSha) { $recSha.Substring(0, 16) } else { $null }
        eqLimitSha  = if ($eqSha) { $eqSha.Substring(0, 16) } else { $null }
        shaMatch    = ($matchRecorded -and $matchEquivalent)
    }
}
$checks | Format-Table -AutoSize | Out-String -Width 200 | Write-Host

# 互不相同：三个保存点必须是三个不同权重。
$distinct = @($checks | Where-Object { $_.sha } | Select-Object -ExpandProperty sha -Unique).Count
$ledgerRows = 0
$ledgerPath = "$mainOut/A_limit9_best.optimizer_update_ledger.jsonl"
if (Test-Path $ledgerPath) { $ledgerRows = (Get-Content $ledgerPath | Measure-Object -Line).Lines }
$missing = @($metrics.artifacts.missingIntermediateUpdates)

$result = [ordered]@{
    schema           = 'v19_t19_00_checkpoint_hook_smoke_1'
    runId            = $RunId
    generatedAt      = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
    design           = @{
        rows            = $Rows
        batchSize       = $BatchSize
        updatesPerEpoch = $Rows / $BatchSize
        epochs          = $Epochs
        globalUpdateLimit = 9
        saveAtUpdates   = $SavePoints
        note            = '保存点 3 落在 epoch 边界，5 落在 epoch 中点（旧实现必然漏掉），7 落在 epoch 3 起点'
    }
    perSavePoint     = $checks
    distinctSnapshots = $distinct
    ledgerRows       = $ledgerRows
    missingIntermediateUpdates = $missing
    intermediateHook = $metrics.artifacts.intermediateHook
    passed           = ($fail -eq 0 -and $distinct -eq 3 -and $ledgerRows -eq 9 -and $missing.Count -eq 0)
}
$resultPath = "$smokeOut/hook_verification.json"
$result | ConvertTo-Json -Depth 8 | Set-Content -Encoding UTF8 $resultPath
Write-Output "[hook-smoke] ledgerRows=$ledgerRows distinctSnapshots=$distinct missing=$($missing -join ',') passed=$($result.passed)"
Write-Output "[hook-smoke] verification -> $resultPath"
if (-not $result.passed) { exit 1 }
