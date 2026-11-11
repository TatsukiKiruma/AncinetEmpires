param([Parameter(Mandatory=$true)][int]$FirstTrainExitCode)
$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $false
$projectRoot = 'C:/code/AncinetEmpires'
$stageOne = "$projectRoot/ai_training/continuation_review_20261030/stage1"
$stageTwo = "$projectRoot/ai_training/continuation_review_20261030/stage2"
$control = "$stageTwo/runner_v4_sync1"
$approval = "$projectRoot/ai_training/continuation_review_20261030/reviews/stage2-review-5.json"
$gpuPython = "$projectRoot/ai_training/.venv-rocm/Scripts/python.exe"
$artifactRoot = 'D:/AncientEmpiresData/continuation_stage2_20261030_v1'
$env:MIOPEN_USER_DB_PATH = "$artifactRoot/miopen-db"
$env:MIOPEN_CUSTOM_CACHE_DIR = "$artifactRoot/miopen-cache"
Set-Location -LiteralPath $projectRoot

function Status([string]$phase,[string]$arm) {
    [ordered]@{phase=$phase;arm=$arm;pid=$PID;time=[DateTimeOffset]::Now.ToString('o')} |
        ConvertTo-Json | Set-Content -LiteralPath "$artifactRoot/V4_PIPELINE_STATUS.json" -Encoding utf8
}

try {
    foreach ($arm in @('lr-1e-4','lr-5e-5','lr-2.4495e-4')) {
        $folder = if ($arm -eq 'lr-1e-4') { "$artifactRoot/lr-1e-4-v4-resume1" } else { "$artifactRoot/$arm" }
        $config = "$stageOne/stage2-configs/$arm.json"
        if ($arm -eq 'lr-1e-4') {
            # 第一臂由交互工具启动，原生退出码由调用者核实后传入；不重新启动它。
            $trainExit = $FirstTrainExitCode
        } else {
            if (Test-Path -LiteralPath $folder) { throw "目录已存在，禁止重开同臂：$arm" }
            Status '真实GPU试训' $arm
            & $gpuPython -X utf8 "$control/train.py" --config $config --out $folder --reviewed-stage --code-approval $approval 1> "$artifactRoot/$arm.v4.stdout.log" 2> "$artifactRoot/$arm.v4.stderr.log"
            $trainExit = $LASTEXITCODE
        }
        [ordered]@{arm=$arm;nativeExitCode=$trainExit;folder=$folder;time=[DateTimeOffset]::Now.ToString('o')} |
            ConvertTo-Json | Set-Content -LiteralPath "$folder/NATIVE_EXIT.json" -Encoding utf8
        Status '闭合后CPU只读核查' $arm
        & $gpuPython -X utf8 "$stageTwo/audit_completed_arm.py" --arm $arm --folder $folder --exit-code $trainExit --out "$stageTwo/FINAL_AUDIT-$arm.json" 1> "$artifactRoot/$arm.final-audit.log" 2>&1
        if ($LASTEXITCODE -ne 0) { throw "$arm 完整性/退出码/闭合审核失败，停止后继" }
        $audited = Get-Content -Raw "$stageTwo/FINAL_AUDIT-$arm.json" | ConvertFrom-Json
        if ($audited.needsTerminalOffline) {
            $terminal = "$folder/terminal-dev"
            if (Test-Path -LiteralPath $terminal) { throw '终点诊断已存在，禁止重复选择' }
            Status '唯一终点固定离线评估' $arm
            & $gpuPython -X utf8 "$stageOne/offline.py" --model "$folder/final" --out $terminal --config $config 1> "$artifactRoot/$arm.terminal-offline.log" 2>&1
            if ($LASTEXITCODE -ne 0) { throw "$arm 终点离线失败，保留并停止后继" }
        }
        $arena = "$folder/arena"
        if (Test-Path -LiteralPath $arena) { throw '终点40局已存在，禁止重复实战' }
        Status '唯一终点困难20加简单20' $arm
        & node --import tsx "$stageOne/arena.ts" "$folder/final" $arena $gpuPython --config $config 1> "$artifactRoot/$arm.v4.arena.stdout.log" 2> "$artifactRoot/$arm.v4.arena.stderr.log"
        if ($LASTEXITCODE -ne 0) { throw "$arm 实战入口失败，停止后继" }
        & $gpuPython -X utf8 "$stageOne/compare_arena.py" "$stageOne/arena-baseline-r2/SUMMARY.json" "$arena/SUMMARY.json" --config $config --out "$stageTwo/COMPARE-$arm.json" 1> "$artifactRoot/$arm.v4.compare.log" 2>&1
        if ($LASTEXITCODE -ne 0) { throw "$arm 科学身份或完整40局比较被拒绝" }
        & $gpuPython -X utf8 "$stageTwo/audit_arena.py" $arena --out "$stageTwo/ARENA-$arm.json" 1> "$artifactRoot/$arm.v4.arena-audit.log" 2>&1
        if ($LASTEXITCODE -ne 0) { throw "$arm 逐局原子摘要链核对失败" }
        $summary = Get-Content -Raw "$arena/SUMMARY.json" | ConvertFrom-Json
        if (@($summary.games | Where-Object classification -eq 'runtime_error').Count -gt 0) {
            throw "$arm 有运行错误，先判定共用故障范围，不自动忽略后继续"
        }
    }
    Status '三臂训练和每臂40局结束，等待汇总审核' 'complete'
} catch {
    [ordered]@{error=$_.Exception.Message;time=[DateTimeOffset]::Now.ToString('o');pid=$PID} |
        ConvertTo-Json | Set-Content -LiteralPath "$artifactRoot/V4_PIPELINE_ERROR.json" -Encoding utf8
    throw
}
