# V18/T18-02：三臂表示对照的训练入口（预登记见 contracts/T18_02_PREREGISTRATION.md）。
#
# 中文说明：
# - 三臂使用**完全相同**的数据、split manifest、目标、预算、优化器与 seed；
#   唯一差异是网络结构（A=基线；B=GAP 全图汇总 + 新列置零）。
# - C 臂（候选关系特征）需要改编码 schema 与 TS/Python 双语言实现，本轮未实现，
#   脚本里明确报错而不是偷偷用 A 代替。
# - 定点保存 1000/2000/4000，便于按 update 观察，而不是只看最后一个点。
#
# 用法：
#   pwsh -NoProfile -ExecutionPolicy Bypass -File v18/scripts/t18_02_arms_train.ps1 -Arms A,B

param(
    [string]$Arms = 'A,B',
    [int]$Updates = 4000,
    [int]$Epochs = 20,
    [string]$RunId = 'run_20260927_v18_01'
)

$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
Set-Location $repo
$env:PYTHONIOENCODING = 'utf-8'
$py = 'C:\Users\SHIINA\AppData\Local\Programs\Python\Python312\python.exe'
$run = "v18/out/$RunId"
$exp = "$run/experiments"
$data = 'v17/out/v17_20260926_r2/experiments/_data'
$champion = 'v16/out/v16_20260926_core/experiments/P1/s2026/P1_final.json'

foreach ($arm in ($Arms -split ',')) {
    $arm = $arm.Trim()
    if ([string]::IsNullOrEmpty($arm)) { continue }
    if ($arm -eq 'C') {
        throw "[t18_02] C 臂需要新的编码 schema 与 TS/Python 双语言实现，本轮未实现；不允许用 A 冒充 C。"
    }
    $dir = "$exp/T18_02_$arm"
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
    $log = "$run/logs/t18_02_train_$arm.log"

    $argv = @(
        'v17/tools/train_v17.py',
        '--dataset', "$data/B0_trainval.jsonl",
        '--split-manifest', "$data/B01_split_manifest.json",
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
    if ($arm -eq 'B') {
        # GAP 全图汇总 + 新增 policy 输入列置零（否则初始 logits 会漂移）。
        $argv += '--global-policy-pool'
        $argv += '--zero-init-new-policy-dims'
    }

    Write-Host "[t18_02-train] arm=$arm -> $dir"
    $proc = Start-Process -FilePath $py -ArgumentList $argv -NoNewWindow -PassThru -RedirectStandardOutput $log -RedirectStandardError "$log.err"
    $deadline = (Get-Date).AddHours(4)
    while (-not $proc.HasExited) {
        if ((Get-Date) -gt $deadline) { throw "[t18_02-train] $arm timeout" }
        Start-Sleep -Seconds 15
    }
    $final = "$dir/${arm}_final.json"
    $metrics = "$dir/metrics.json"
    if (-not (Test-Path $final) -or -not (Test-Path $metrics)) {
        throw "[t18_02-train] $arm produced no final checkpoint / metrics; see $log and $log.err"
    }
    $ledger = Get-ChildItem "$dir/*.optimizer_update_ledger.jsonl" -ErrorAction SilentlyContinue
    $updates = if ($null -ne $ledger) { (Get-Content $ledger[0].FullName | Measure-Object -Line).Lines } else { 'NO_LEDGER' }
    Write-Host "[t18_02-train] $arm ok: ledgerUpdates=$updates"
    Get-Content $log -Tail 3 | Write-Host
}
Write-Host '[t18_02-train] done'
