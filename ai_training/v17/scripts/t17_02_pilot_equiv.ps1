# V17/T17-02 equivalence + timing pilot (real commands, no backslash continuation).
# 1) 上游 python/train_spatial_resnet.py 与副本 v17/tools/train_v17.py 在**默认开关**下
#    必须产生逐位相同的权重（证明「不加新开关 = 行为完全一致」）。
# 2) 同时测量每次 optimizer update 的耗时（ledger 里的 durationMs），用于估算 3 x 4,000 更新的墙钟。
$ErrorActionPreference = 'Stop'
$py = 'C:\Users\SHIINA\AppData\Local\Programs\Python\Python312\python.exe'
Set-Location C:\code\AncinetEmpires
$root = 'v17/out/v17_20260926_r2/experiments/_scratch'
$ds   = 'v17/out/v17_20260926_r2/experiments/_data/legacy_trainval_truefamily.jsonl'
$mf   = 'v17/out/v17_20260926_r2/data/legacy_split_manifest.json'
$init = 'v16/out/v16_20260926_core/experiments/P1/s2026/P1_final.json'
$schema = 'spatial26_global20_actionSemantics53_v15'

foreach ($variant in @(
    @{ name = 'equiv_upstream'; script = 'python/train_spatial_resnet.py' },
    @{ name = 'equiv_v17copy';  script = 'v17/tools/train_v17.py' }
)) {
    $out = "$root/$($variant.name)"
    New-Item -ItemType Directory -Force -Path $out | Out-Null
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    & $py $variant.script `
        --dataset $ds `
        --split-manifest $mf `
        --epochs 1 `
        --max-steps 20 `
        --batch-size 32 `
        --lr 3e-4 `
        --lr-min 1e-5 `
        --lr-schedule cosine `
        --lr-schedule-unit update `
        --lr-total-updates 4000 `
        --weight-decay 1e-4 `
        --num-blocks 2 `
        --spatial-channels 26 `
        --encoder-schema-id $schema `
        --init-checkpoint $init `
        --seed 42 `
        --data-order-seed 314159 `
        --value-weight 0.0 `
        --out-model "$out/$($variant.name)_best.json" `
        --out-last-model "$out/$($variant.name)_last.json" `
        --out-final-model "$out/$($variant.name)_final.json" `
        --out-metrics "$out/metrics.json" `
        --out-state "$out/state.pt" `
        *> "$out/run.log"
    $sw.Stop()
    Write-Output "[$($variant.name)] exit=$LASTEXITCODE wall=$([math]::Round($sw.Elapsed.TotalSeconds,1))s"
}

Write-Output "--- SHA256 of final checkpoints (must be identical) ---"
Get-FileHash "$root/equiv_upstream/equiv_upstream_final.json" -Algorithm SHA256 | Select-Object -ExpandProperty Hash
Get-FileHash "$root/equiv_v17copy/equiv_v17copy_final.json"  -Algorithm SHA256 | Select-Object -ExpandProperty Hash
Write-Output "--- per-update duration (last 5 rows of upstream ledger) ---"
$led = Get-Content "$root/equiv_upstream/equiv_upstream_best.optimizer_update_ledger.jsonl" | Select-Object -Last 5
$led | ForEach-Object { $o = $_ | ConvertFrom-Json; "{0} lr={1} durMs={2}" -f $o.update, $o.lr, $o.durationMs }
Write-Output "--- git status of protected paths (must show no change) ---"
git status --porcelain python/train_spatial_resnet.py src 2>&1 | Out-String
