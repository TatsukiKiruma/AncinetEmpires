# V17/T17-05: train the B0 / B1 same-budget contrast (ASCII only, no backslash continuation).
#
# B0 and B1 use the SAME input rows in the SAME order, the SAME split manifest, the SAME
# warm start, the SAME 4,000 real updates and the SAME sampling seed. The only difference
# is the policy label column (L1/H0 vs B100-Q hard action).
#
# Usage:
#   pwsh -NoProfile -ExecutionPolicy Bypass -File v17/scripts/t17_05_b0b1_train.ps1 -Arms B0,B1
#
param(
    [string]$Arms = 'B0,B1',
    # Single-factor training knobs. Defaults reproduce the pre-registered B0/B1 recipe exactly;
    # only change ONE at a time and record it in the report.
    [string]$Lr = '3e-4',
    [int]$Updates = 4000,
    # Epochs must be large enough that --global-update-limit is the binding stop condition
    # (12,021 rows / batch 32 = ~376 updates per epoch, so 16k updates needs >= 43 epochs).
    [int]$Epochs = 25,
    [int]$Blocks = 2,
    [string]$DatasetSuffix = '_trainval',
    # Split manifest must list the families actually present in the dataset, otherwise the
    # trainer drops every row whose family is in neither trainRootFamilies nor valRootFamilies.
    [string]$Manifest = 'v17/out/v17_20260926_r2/experiments/_data/B01_split_manifest.json'
)

$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
Set-Location $repo
$env:PYTHONIOENCODING = 'utf-8'
$py = 'C:\Users\SHIINA\AppData\Local\Programs\Python\Python312\python.exe'
$run = 'v17/out/v17_20260926_r2'
$exp = "$run/experiments"
$data = "$exp/_data"
$champion = 'v16/out/v16_20260926_core/experiments/P1/s2026/P1_final.json'

foreach ($arm in ($Arms -split ',')) {
    $arm = $arm.Trim()
    if ([string]::IsNullOrEmpty($arm)) { continue }
    $dir = "$exp/$arm"
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
    $dataset = "$data/${arm}$DatasetSuffix.jsonl"
    if (-not (Test-Path $dataset)) { throw "missing dataset: $dataset" }
    $log = "$run/logs/t17_05_train_$arm.log"
    Write-Host "[t17_05-train] $arm <- $dataset"

    $argv = @(
        'v17/tools/train_v17.py',
        '--dataset', $dataset,
        '--split-manifest', $Manifest,
        '--epochs', "$Epochs",
        '--global-update-limit', "$Updates",
        '--batch-size', '32',
        '--lr', "$Lr",
        '--lr-min', '1e-5',
        '--lr-schedule', 'cosine',
        '--lr-schedule-unit', 'update',
        '--lr-total-updates', "$Updates",
        '--weight-decay', '1e-4',
        '--num-blocks', "$Blocks",
        '--spatial-channels', '26',
        '--encoder-schema-id', 'spatial26_global20_actionSemantics53_v15',
        '--init-checkpoint', $champion,
        '--seed', '42',
        '--data-order-seed', '314159',
        '--trainable-parts', 'trunk,policy',
        '--value-weight', '0.0',
        '--out-model', "$dir/${arm}_best.json",
        '--out-last-model', "$dir/${arm}_last.json",
        '--out-final-model', "$dir/${arm}_final.json",
        '--out-metrics', "$dir/metrics.json",
        '--out-state', "$dir/train_state.pt",
        '--planned-manifest', "$dir/planned_samples_manifest.json",
        '--optimized-manifest', "$dir/optimized_samples_manifest.json"
    )
    $proc = Start-Process -FilePath $py -ArgumentList $argv -NoNewWindow -PassThru -RedirectStandardOutput $log -RedirectStandardError "$log.err"
    $deadline = (Get-Date).AddHours(3)
    while (-not $proc.HasExited) {
        if ((Get-Date) -gt $deadline) { throw "[t17_05-train] $arm timeout" }
        Start-Sleep -Seconds 15
    }
    # The sandbox may not expose ExitCode for a Start-Process child ($null), so success is
    # judged by the artifacts the trainer must have written, not by $proc.ExitCode.
    $final = "$dir/${arm}_final.json"
    $metrics = "$dir/metrics.json"
    $ledger = Get-ChildItem "$dir/*.optimizer_update_ledger.jsonl" -ErrorAction SilentlyContinue
    if (-not (Test-Path $final) -or -not (Test-Path $metrics) -or $null -eq $ledger) {
        throw "[t17_05-train] $arm produced no final checkpoint / metrics / ledger; see $log and $log.err"
    }
    $updates = (Get-Content $ledger[0].FullName | Measure-Object -Line).Lines
    Write-Host "[t17_05-train] $arm ok: ledgerUpdates=$updates exitCode='$($proc.ExitCode)'"
    Get-Content $log -Tail 4 | Write-Host
}
Write-Host '[t17_05-train] done'

