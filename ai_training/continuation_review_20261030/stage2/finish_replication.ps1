param([Parameter(Mandatory=$true)][int]$NativeTrainExitCode)
$ErrorActionPreference='Stop'
$PSNativeCommandUseErrorActionPreference=$false
$projectRoot='C:/code/AncinetEmpires'
$study="$projectRoot/ai_training/continuation_review_20261030"
$stageTwo="$study/stage2"
$dataRoot='D:/AncientEmpiresData/continuation_stage2_20261030_v1'
$replica="$dataRoot/lr-1e-4-seed20261031"
$python="$projectRoot/ai_training/.venv-rocm/Scripts/python.exe"
$parentConfig="$study/stage1/stage2-configs/lr-1e-4.json"
$env:MIOPEN_USER_DB_PATH="$dataRoot/miopen-db"
$env:MIOPEN_CUSTOM_CACHE_DIR="$dataRoot/miopen-cache"
Set-Location -LiteralPath $projectRoot
try {
    & $python -X utf8 "$stageTwo/audit_replication.py" --folder $replica --exit-code $NativeTrainExitCode 1> "$dataRoot/replication-final-audit.log" 2>&1
    if($LASTEXITCODE -ne 0){throw '复验完整终点审核失败，保留状态，不启动实战'}
    if(Test-Path -LiteralPath "$replica/arena"){throw '复验实战已存在，禁止重复'}
    [ordered]@{phase='唯一终点困难20加简单20';time=[DateTimeOffset]::Now.ToString('o')} | ConvertTo-Json | Set-Content -LiteralPath "$dataRoot/REPLICATION_PIPELINE_STATUS.json" -Encoding utf8
    & node --import tsx "$study/stage1/arena.ts" "$replica/final" "$replica/arena" $python --config $parentConfig 1> "$dataRoot/replication-arena.stdout.log" 2> "$dataRoot/replication-arena.stderr.log"
    if($LASTEXITCODE -ne 0){throw '复验实战入口失败'}
    & $python -X utf8 "$study/stage1/compare_arena.py" "$study/stage1/arena-baseline-r2/SUMMARY.json" "$replica/arena/SUMMARY.json" --config $parentConfig --out "$stageTwo/REPLICATION_COMPARE.json" 1> "$dataRoot/replication-compare.log" 2>&1
    if($LASTEXITCODE -ne 0){throw '复验40局身份或配对比较失败'}
    & $python -X utf8 "$stageTwo/audit_arena.py" "$replica/arena" --out "$stageTwo/REPLICATION_ARENA.json" 1> "$dataRoot/replication-arena-audit.log" 2>&1
    if($LASTEXITCODE -ne 0){throw '复验逐步摘要链核查失败'}
    [ordered]@{phase='训练及唯一40局结束';complete=$true;time=[DateTimeOffset]::Now.ToString('o')} | ConvertTo-Json | Set-Content -LiteralPath "$dataRoot/REPLICATION_PIPELINE_STATUS.json" -Encoding utf8
} catch {
    [ordered]@{error=$_.Exception.Message;time=[DateTimeOffset]::Now.ToString('o')} | ConvertTo-Json | Set-Content -LiteralPath "$dataRoot/REPLICATION_PIPELINE_ERROR.json" -Encoding utf8
    throw
}
