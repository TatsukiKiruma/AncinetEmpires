# V17/T17-02 真实训练运行：V0 / P0 / PV0（各 4,000 次真实 optimizer update）。
# 真实命令（PowerShell 参数数组，无反斜杠续行）：
#   pwsh -NoProfile -File v17/scripts/t17_02_runs.ps1 -Arms V0,P0,PV0
#   pwsh -NoProfile -File v17/scripts/t17_02_runs.ps1 -Smoke      # 2 次更新的探针冒烟测试
#
# 三组共享的常量：同一数据集、同一 split manifest、同一 data-order-seed、
# batch32、AdamW lr 3e-4 按 update 余弦退到 1e-5、weight_decay 1e-4、num-blocks 2、
# 无 global-policy-pool、channels 26、schema spatial26_global20_actionSemantics53_v15、
# 同一冠军 P1:s2026 热启动。
param(
    [string]$Arms = 'V0,P0,PV0',
    [switch]$Smoke
)
$py = 'C:\Users\SHIINA\AppData\Local\Programs\Python\Python312\python.exe'
Set-Location C:\code\AncinetEmpires
$exp  = 'v17/out/v17_20260926_r2/experiments'
$ds   = "$exp/_data/legacy_trainval_truefamily.jsonl"
$mf   = 'v17/out/v17_20260926_r2/data/legacy_split_manifest.json'
$init = 'v16/out/v16_20260926_core/experiments/P1/s2026/P1_final.json'
$schema = 'spatial26_global20_actionSemantics53_v15'
$probeLauncher = 'v17/scripts/probe/run_with_probe.py'
$trainer = 'v17/tools/train_v17.py'

$configs = @{
    V0  = @{ parts = 'value';              vw = 1.0  }
    P0  = @{ parts = 'trunk,policy';       vw = 0.0  }
    PV0 = @{ parts = 'trunk,policy,value'; vw = 0.25 }
}

function Invoke-Arm {
    param([string]$Arm, [int]$Updates, [int]$Epochs, [string]$OutDir, [string]$Tag)
    $cfg = $configs[$Arm]
    New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
    $env:V17_PROBE_OUT = "$OutDir/value_head_grad_probe.jsonl"
    $argv = @(
        $probeLauncher, $trainer,
        '--dataset', $ds,
        '--split-manifest', $mf,
        '--epochs', "$Epochs",
        '--global-update-limit', "$Updates",
        '--batch-size', '32',
        '--lr', '3e-4',
        '--lr-min', '1e-5',
        '--lr-schedule', 'cosine',
        '--lr-schedule-unit', 'update',
        '--lr-total-updates', '4000',
        '--weight-decay', '1e-4',
        '--num-blocks', '2',
        '--spatial-channels', '26',
        '--encoder-schema-id', $schema,
        '--init-checkpoint', $init,
        '--seed', '42',
        '--data-order-seed', '314159',
        '--trainable-parts', $cfg.parts,
        '--value-weight', "$($cfg.vw)",
        '--value-loss-normalize', 'valid-mask',
        '--out-model', "$OutDir/${Tag}_best.json",
        '--out-last-model', "$OutDir/${Tag}_last.json",
        '--out-final-model', "$OutDir/${Tag}_final.json",
        '--out-metrics', "$OutDir/metrics.json",
        '--out-state', "$OutDir/train_state.pt",
        '--optimized-manifest', "$OutDir/optimized_samples_manifest.json"
    )
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    & $py @argv *> "$OutDir/run.log"
    $code = $LASTEXITCODE
    $sw.Stop()
    $resolved = [ordered]@{
        schema        = 'v17_resolved_config_1'
        arm           = $Arm
        tag           = $Tag
        generatedAt   = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
        python        = $py
        launcher      = $probeLauncher
        trainer       = $trainer
        argv          = $argv
        trainableParts = $cfg.parts
        valueWeight   = $cfg.vw
        valueLossNormalize = 'valid-mask'
        seed          = 42
        dataOrderSeed = 314159
        globalUpdateLimit = $Updates
        lrTotalUpdates = 4000
        batchSize     = 32
        lr            = 3e-4
        lrMin         = 1e-5
        lrSchedule    = 'cosine'
        weightDecay   = 1e-4
        numBlocks     = 2
        globalPolicyPool = $false
        spatialChannels = 26
        encoderSchemaId = $schema
        initCheckpoint = $init
        dataset       = $ds
        splitManifest = $mf
        workingDir    = 'C:\code\AncinetEmpires'
        exitCode      = $code
        wallSeconds   = [math]::Round($sw.Elapsed.TotalSeconds, 1)
        torchThreads  = 8
        probeOutput   = $env:V17_PROBE_OUT
    }
    $resolved | ConvertTo-Json -Depth 6 | Set-Content -Encoding UTF8 "$OutDir/resolved_config.json"
    Write-Output "[$Tag] exit=$code wall=$([math]::Round($sw.Elapsed.TotalSeconds,1))s -> $OutDir"
}

if ($Smoke) {
    Invoke-Arm -Arm 'V0' -Updates 2 -Epochs 1 -OutDir "$exp/_scratch/smoke_probe" -Tag 'smoke'
    Write-Output '--- probe rows ---'
    Get-Content "$exp/_scratch/smoke_probe/value_head_grad_probe.jsonl" | Select-Object -First 6
    exit 0
}

foreach ($arm in ($Arms -split ',')) {
    $arm = $arm.Trim()
    if (-not $configs.ContainsKey($arm)) { Write-Output "[skip] unknown arm $arm"; continue }
    Invoke-Arm -Arm $arm -Updates 4000 -Epochs 25 -OutDir "$exp/$arm" -Tag $arm
}
Write-Output '--- final checkpoint hashes ---'
foreach ($arm in ($Arms -split ',')) {
    $arm = $arm.Trim()
    $p = "$exp/$arm/${arm}_final.json"
    if (Test-Path $p) { Write-Output "$arm $((Get-FileHash $p -Algorithm SHA256).Hash)" }
}
