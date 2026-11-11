$ErrorActionPreference='Stop'
Set-Location -LiteralPath 'C:\code\AncinetEmpires'
$schedule=@(@{Workers=16;Round=1},@{Workers=32;Round=1},@{Workers=64;Round=1},@{Workers=64;Round=2},@{Workers=32;Round=2},@{Workers=16;Round=2})
foreach($test in $schedule){
    $runName="bench-concurrency-$($test.Workers)-r$($test.Round)"
    & node ai_training/run.mjs node --openssl-legacy-provider --import tsx gpu/parallel/run.ts --out "hard_replica_gpu_20261029/$runName" --workers $test.Workers --backend gpu --benchmark --limit 100 --max-actions 100
    if($LASTEXITCODE -ne 0){throw "并发测试失败：$runName"}
    $progress=Get-Content -LiteralPath "ai_training/hard_replica_gpu_20261029/$runName/PROGRESS.json" -Raw | ConvertFrom-Json
    [ordered]@{run=$runName;phase=$progress.phase;seconds=$progress.measuredSeconds;maxActive=$progress.maxActive;gpuMax=$progress.gpu.utilMax} | ConvertTo-Json -Compress
}
