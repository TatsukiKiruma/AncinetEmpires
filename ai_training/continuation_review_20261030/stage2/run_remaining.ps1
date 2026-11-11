$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $false
$projectRoot = 'C:/code/AncinetEmpires'
$stageOne = "$projectRoot/ai_training/continuation_review_20261030/stage1"
$stageTwo = "$projectRoot/ai_training/continuation_review_20261030/stage2"
$artifactRoot = 'D:/AncientEmpiresData/continuation_stage2_20261030_v1'
$gpuPython = "$projectRoot/ai_training/.venv-rocm/Scripts/python.exe"
$env:MIOPEN_USER_DB_PATH = "$artifactRoot/miopen-db"
$env:MIOPEN_CUSTOM_CACHE_DIR = "$artifactRoot/miopen-cache"
Set-Location -LiteralPath $projectRoot

function Save-PipelineStatus([string] $phase, [string] $arm) {
    [ordered]@{phase=$phase;arm=$arm;time=[DateTimeOffset]::Now.ToString('o');pid=$PID} |
        ConvertTo-Json | Set-Content -LiteralPath "$artifactRoot/PIPELINE_STATUS.json" -Encoding utf8
}

try {
    # 第一臂已由交互工具启动；这里只等待其自行完成，不重开、不恢复、不停止它。
    Save-PipelineStatus '等待已启动的第一臂' 'lr-1e-4'
    while ($true) {
        if ((Test-Path "$artifactRoot/lr-1e-4/ERROR.json") -or (Test-Path "$artifactRoot/lr-1e-4/STOPPED.json")) {
            throw '第一臂发生异常或操作预算停止，暂停后继，等待检查原始证据'
        }
        $ledger = Get-Content -Raw "$artifactRoot/lr-1e-4/ARM_BUDGET.json" | ConvertFrom-Json
        if ($ledger.status -ne 'running') { break }
        if (-not (Get-Process -Id $ledger.pid -ErrorAction SilentlyContinue)) { throw '第一臂进程已退出但账本未正常关闭，禁止自动续跑' }
        Start-Sleep -Seconds 10
    }
    foreach ($armName in @('lr-1e-4','lr-5e-5','lr-2.4495e-4')) {
        $armRoot = "$artifactRoot/$armName"
        $configPath = "$stageOne/stage2-configs/$armName.json"
        if ($armName -ne 'lr-1e-4') {
            if (Test-Path -LiteralPath $armRoot) { throw "输出已存在，拒绝重开同臂：$armName" }
            Save-PipelineStatus '真实试训' $armName
            & $gpuPython -X utf8 "$stageOne/train.py" --config $configPath --out $armRoot --reviewed-stage 1> "$artifactRoot/$armName.stdout.log" 2> "$artifactRoot/$armName.stderr.log"
            if ($LASTEXITCODE -ne 0) { throw "$armName 训练入口退出$LASTEXITCODE，暂停后继" }
        }
        if ((Test-Path "$armRoot/ERROR.json") -or (Test-Path "$armRoot/STOPPED.json") -or -not (Test-Path "$armRoot/RESULT.json")) {
            throw "$armName 未产生正常或退化停止的终点，暂停后继，保留原状态"
        }
        Save-PipelineStatus '只读完整状态核查' $armName
        & $gpuPython -X utf8 "$stageTwo/audit_stage2.py" --root $artifactRoot --out "$stageTwo/AUDIT-after-$armName.json" 1> "$artifactRoot/$armName.audit.log" 2>&1
        if ($LASTEXITCODE -ne 0) { throw "$armName 只读核查失败，暂停后继" }
        $arenaRoot = "$armRoot/arena"
        if (Test-Path -LiteralPath $arenaRoot) { throw '实战目录已存在，禁止重复40局' }
        Save-PipelineStatus '终点困难20加简单20' $armName
        & node --import tsx "$stageOne/arena.ts" "$armRoot/final" $arenaRoot $gpuPython --config $configPath 1> "$artifactRoot/$armName.arena.stdout.log" 2> "$artifactRoot/$armName.arena.stderr.log"
        if ($LASTEXITCODE -ne 0) { throw "$armName 实战入口失败，暂停后继" }
        & $gpuPython -X utf8 "$stageOne/compare_arena.py" "$stageOne/arena-baseline-r2/SUMMARY.json" "$arenaRoot/SUMMARY.json" --config $configPath --out "$stageTwo/COMPARE-$armName.json" 1> "$artifactRoot/$armName.compare.log" 2>&1
        if ($LASTEXITCODE -ne 0) { throw "$armName 批准比较器拒绝，暂停后继" }
        & $gpuPython -X utf8 "$stageTwo/audit_arena.py" $arenaRoot --out "$stageTwo/ARENA-$armName.json" 1> "$artifactRoot/$armName.arena-audit.log" 2>&1
        if ($LASTEXITCODE -ne 0) { throw "$armName 原子记录核查失败，暂停后继" }
        $arenaSummary = Get-Content -Raw "$arenaRoot/SUMMARY.json" | ConvertFrom-Json
        if ($arenaSummary.naturalGames -ne 40) { throw "$armName 自然结果不足40，保留失败并暂停后继以检查共用故障" }
    }
    Save-PipelineStatus '全部三臂及各40局结束，等待独立协调审核' 'complete'
} catch {
    [ordered]@{error=$_.Exception.Message;time=[DateTimeOffset]::Now.ToString('o');pid=$PID} |
        ConvertTo-Json | Set-Content -LiteralPath "$artifactRoot/PIPELINE_ERROR.json" -Encoding utf8
    throw
}
