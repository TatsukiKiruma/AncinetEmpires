$ErrorActionPreference='Stop'
Set-Location -LiteralPath 'C:\code\AncinetEmpires'
foreach($workers in @(32,64,128)){
    $runName="bench-single-batch-$workers"
    $started=Get-Date
    & node ai_training/run.mjs node --openssl-legacy-provider --import tsx gpu/parallel/run.ts --out "hard_replica_gpu_20261029/$runName" --workers $workers --limit $workers --backend gpu --benchmark --single-batch --gpu-range
    if($LASTEXITCODE -ne 0){throw "单批测试失败：$runName"}
    $progress=Get-Content -LiteralPath "ai_training/hard_replica_gpu_20261029/$runName/PROGRESS.json" -Raw | ConvertFrom-Json
    [ordered]@{workers=$workers;phase=$progress.phase;natural=$progress.natural;seconds=$progress.measuredSeconds;wallSeconds=$progress.wallSeconds;processWallSeconds=((Get-Date)-$started).TotalSeconds;maxActive=$progress.maxActive;gpuMax=$progress.gpu.utilMax} | ConvertTo-Json -Compress | Tee-Object -FilePath 'ai_training/hard_replica_gpu_20261029/single_batch_32_64_128/COMPLETIONS.jsonl' -Append
}
