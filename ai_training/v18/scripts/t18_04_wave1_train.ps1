# V18/T18-04 第 1 波：受约束更新的两臂对照（预登记见 reports/T18_04_report.md）。
#
# 中文说明：
# - 两臂**同数据、同预算、同 seed、同 warm start**，唯一差异是 KL 约束：
#     U = 无约束更新（不加 KL）
#     K = 对冻结冠军 KL 约束（kl_weight 由 -KlWeight 指定）
# - KL 是「防止无益漂移」的假设，不是保证提升的开关；两臂都要完整 DEV20 才算数。
# - 数据集里 targeted（平衡局面，优先覆盖高代价区域）与 replay 已经按预登记混合好，
#   混合比例是**数据侧**的事，trainer 不需要额外的 replay 机制。
#
# 用法：
#   pwsh -NoProfile -ExecutionPolicy Bypass -File v18/scripts/t18_04_wave1_train.ps1 -Arms U,K

param(
    [string]$Arms = 'U,K',
    [int]$Updates = 4000,
    [int]$Epochs = 20,
    [double]$KlWeight = 0.5,
    [string]$RunId = 'run_20260927_v18_01'
)

$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
Set-Location $repo
$env:PYTHONIOENCODING = 'utf-8'
$py = 'C:\Users\SHIINA\AppData\Local\Programs\Python\Python312\python.exe'
$run = "v18/out/$RunId"
$exp = "$run/experiments"
$data = "$run/data/t18_04"
$champion = 'v16/out/v16_20260926_core/experiments/P1/s2026/P1_final.json'

foreach ($arm in ($Arms -split ',')) {
    $arm = $arm.Trim()
    if ([string]::IsNullOrEmpty($arm)) { continue }
    $dir = "$exp/T18_04_w1_$arm"
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
    $log = "$run/logs/t18_04_w1_$arm.log"

    $argv = @(
        'v17/tools/train_v17.py',
        '--dataset', "$data/T18_04_wave1_trainval.jsonl",
        '--split-manifest', "$data/T18_04_split_manifest.json",
        '--epochs', "$Epochs",
        '--global-update-limit', "$Updates",
        '--batch-size', '32',
        '--lr', '3e-4',
        '--lr-min', '1e-5',
        '--lr-schedule', 'cosine',
        '--lr-schedule-unit', 'update',
        '--lr-total-updates', "$Updates",
        '--weight-decay', '1e-4',
        '--num-blocks', '2',
        '--spatial-channels', '26',
        '--encoder-schema-id', 'spatial26_global20_actionSemantics53_v15',
        '--init-checkpoint', $champion,
        '--seed', '42',
        '--data-order-seed', '314159',
        '--trainable-parts', 'trunk,policy',
        '--value-weight', '0.0',
        '--save-at-updates', '1000,2000,4000',
        '--out-model', "$dir/${arm}_best.json",
        '--out-last-model', "$dir/${arm}_last.json",
        '--out-final-model', "$dir/${arm}_final.json",
        '--out-metrics', "$dir/metrics.json",
        '--out-state', "$dir/train_state.pt",
        '--planned-manifest', "$dir/planned_samples_manifest.json",
        '--optimized-manifest', "$dir/optimized_samples_manifest.json"
    )
    if ($arm -eq 'K') {
        $argv += '--kl-to-frozen'
        $argv += $champion
        $argv += '--kl-weight'
        $argv += "$KlWeight"
    }

    Write-Host "[t18_04-w1] arm=$arm -> $dir"
    $proc = Start-Process -FilePath $py -ArgumentList $argv -NoNewWindow -PassThru -RedirectStandardOutput $log -RedirectStandardError "$log.err"
    $deadline = (Get-Date).AddHours(4)
    while (-not $proc.HasExited) {
        if ((Get-Date) -gt $deadline) { throw "[t18_04-w1] $arm timeout" }
        Start-Sleep -Seconds 15
    }
    $final = "$dir/${arm}_final.json"
    $metrics = "$dir/metrics.json"
    if (-not (Test-Path $final) -or -not (Test-Path $metrics)) {
        throw "[t18_04-w1] $arm produced no final checkpoint / metrics; see $log and $log.err"
    }
    $ledger = Get-ChildItem "$dir/*.optimizer_update_ledger.jsonl" -ErrorAction SilentlyContinue
    $updates = if ($null -ne $ledger) { (Get-Content $ledger[0].FullName | Measure-Object -Line).Lines } else { 'NO_LEDGER' }
    Write-Host "[t18_04-w1] $arm ok: ledgerUpdates=$updates"
    Get-Content $log -Tail 3 | Write-Host
}
Write-Host '[t18_04-w1] done'
