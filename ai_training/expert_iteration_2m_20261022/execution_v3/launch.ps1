param([switch]$CheckOnly)
$ErrorActionPreference = 'Stop'
$experiment = 'C:\code\AncinetEmpires\ai_training\expert_iteration_2m_20261022'
$revision = Join-Path $experiment 'execution_v3'
$python = 'C:\Users\SHIINA\AppData\Local\Programs\Python\Python312\python.exe'
$legacyId = 52060

function Write-Record($Path, $Value) {
    $temporary = $Path + '.pending'
    [IO.File]::WriteAllText($temporary, ($Value | ConvertTo-Json -Depth 12), (New-Object Text.UTF8Encoding($false)))
    Move-Item -LiteralPath $temporary -Destination $Path -Force
}

function Assert-Identity {
    $identity = Get-Content -LiteralPath (Join-Path $revision 'formal-source-identity.json') -Raw | ConvertFrom-Json
    foreach ($entry in $identity.PSObject.Properties) {
        $file = Join-Path 'C:\code\AncinetEmpires' $entry.Name
        if ((Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant() -ne $entry.Value) { throw ('冻结身份变化：' + $entry.Name) }
    }
}

function Assert-SamplingBoundary {
    $jobs = @(Get-Content -LiteralPath (Join-Path $revision 'sampling-plan-v3.json') -Raw | ConvertFrom-Json | Where-Object { $_.generation -eq 1 })
    if ($jobs.Count -ne 200) { throw '第一代计划不是200局，拒绝切换' }
    foreach ($job in $jobs) {
        $folder = Join-Path $experiment ('generations\gen_01\sampling\' + $job.id)
        $resultFile = Join-Path $folder 'result.json'
        $result = Get-Content -LiteralPath $resultFile -Raw | ConvertFrom-Json
        $strict = Get-Content -LiteralPath (Join-Path $folder 'strict.json') -Raw | ConvertFrom-Json
        if (-not $strict.passed -or $result.error -or $strict.sourceResultSha256 -ne (Get-FileHash -LiteralPath $resultFile -Algorithm SHA256).Hash.ToLowerInvariant()) { throw ('第一代结果尚未通过独立核验：' + $job.id) }
    }
}

$state = Get-Content -LiteralPath (Join-Path $experiment 'PIPELINE_STATE.json') -Raw | ConvertFrom-Json
if ($CheckOnly) {
    Assert-Identity
    @{ stage = $state.stage; generation = $state.generation; legacyPid = $legacyId; plannedParents = 380; boundaryReady = ($state.stage -eq 'training' -and $state.generation -eq 1) } | ConvertTo-Json
    exit 0
}

try {
    Set-Location -LiteralPath 'C:\code\AncinetEmpires'
    Assert-Identity
    if (Test-Path -LiteralPath (Join-Path $revision 'SUPERVISOR.json')) { throw '本修订已有启动回执，拒绝重复托管' }
    Write-Record (Join-Path $revision 'SUPERVISOR.json') @{ pid = $PID; startedAt = (Get-Date -Format o); legacyPid = $legacyId; entry = 'execution_v3/launch.ps1' }
    while ($true) {
        $legacy = Get-CimInstance Win32_Process -Filter ('ProcessId=' + $legacyId)
        if (-not $legacy -or $legacy.CommandLine -notlike '*expert_iteration_2m_20261022\pipeline.py --run*') { throw '旧调度提前退出或身份变化，保留现场，拒绝自动重开' }
        $state = Get-Content -LiteralPath (Join-Path $experiment 'PIPELINE_STATE.json') -Raw | ConvertFrom-Json
        Write-Record (Join-Path $revision 'SUPERVISOR_STATE.json') @{ status = 'awaiting_first_generation_sampling'; checkedAt = (Get-Date -Format o); legacyPid = $legacyId; supervisorPid = $PID; plannedParents = 380 }
        if ($state.stage -eq 'training' -and $state.generation -eq 1) { break }
        if ($state.generation -gt 1 -or $state.stage -eq 'completed_experiment') { throw '已越过约定交接边界，拒绝强行切换' }
        Start-Sleep -Seconds 5
    }

    Assert-Identity
    Assert-SamplingBoundary
    # 仅在200局全部完成并通过strict后切换调度；保留正在运行的第一代训练或报告子进程。
    $children = @(Get-CimInstance Win32_Process -Filter ('ParentProcessId=' + $legacyId))
    foreach ($child in $children) {
        if ($child.CommandLine -notlike '*expert_iteration_2m_20261022\report.py*' -and $child.CommandLine -notlike '*expert_iteration_2m_20261022\train.py*--run expert_gen_01*') { throw ('边界出现未预期子进程，未停止旧调度：' + $child.ProcessId) }
    }
    $backup = Join-Path $revision 'handoff-before'
    New-Item -ItemType Directory -Path $backup -ErrorAction Stop | Out-Null
    foreach ($name in @('PROCESS.json', 'PIPELINE_STATE.json', 'REPORT.md')) { Copy-Item -LiteralPath (Join-Path $experiment $name) -Destination (Join-Path $backup $name) -ErrorAction Stop }
    Stop-Process -Id $legacyId -ErrorAction Stop
    $children = @(Get-CimInstance Win32_Process -Filter ('ParentProcessId=' + $legacyId))
    $handoff = @{ status = 'awaiting_inflight_children'; at = (Get-Date -Format o); oldPipelinePid = $legacyId; supervisorPid = $PID; childPids = @($children | ForEach-Object { $_.ProcessId }); samplingStrictPassed = 200; plannedParents = 380 }
    Write-Record (Join-Path $revision 'HANDOFF.json') $handoff
    Write-Record (Join-Path $experiment 'PROCESS.json') @{ pid = $PID; role = '等待已有第一代子阶段完成后启用v3调度'; executionRevision = 3; supervisorPid = $PID; previousPipelinePid = $legacyId; childPids = $handoff.childPids }
    foreach ($child in $children) {
        $process = Get-Process -Id $child.ProcessId -ErrorAction SilentlyContinue
        if ($process) { $process.WaitForExit() }
        if ($child.CommandLine -like '*\train.py*' -and -not (Test-Path -LiteralPath (Join-Path $experiment 'training\expert_gen_01\complete.json'))) { throw '已有第一代训练退出但未完成，保留检查点并停止交接' }
    }

    Assert-Identity
    $active = @(Get-CimInstance Win32_Process -Filter "Name='python.exe'" | Where-Object { $_.CommandLine -like '*expert_iteration_2m_20261022*pipeline.py*' })
    if ($active.Count -gt 0) { throw '仍有流水线进程，拒绝重复启动' }
    $pipeline = Start-Process -FilePath $python -ArgumentList @('-B', '-X', 'utf8', (Join-Path $revision 'pipeline.py'), '--run') -WorkingDirectory 'C:\code\AncinetEmpires' -WindowStyle Hidden -RedirectStandardOutput (Join-Path $revision 'pipeline.stdout.log') -RedirectStandardError (Join-Path $revision 'pipeline.stderr.log') -PassThru
    $record = @{ pid = $pipeline.Id; launcherPid = $PID; startedAt = (Get-Date -Format o); entry = 'execution_v3/pipeline.py --run'; executionRevision = 3; plannedParents = 380; hostedBy = '独立后台托管；第一代完成后按用户要求切换'; previousPipelinePid = $legacyId }
    Write-Record (Join-Path $revision 'PROCESS.json') $record
    Write-Record (Join-Path $experiment 'PROCESS.json') $record
    Write-Record (Join-Path $revision 'HANDOFF.json') @{ status = 'v3_started'; at = (Get-Date -Format o); pipelinePid = $pipeline.Id; previousPipelinePid = $legacyId; samplingStrictPassed = 200; plannedParents = 380 }
    Write-Record (Join-Path $revision 'SUPERVISOR_STATE.json') @{ status = 'v3_running'; at = (Get-Date -Format o); pipelinePid = $pipeline.Id; supervisorPid = $PID }
    $pipeline.WaitForExit()
    Write-Record (Join-Path $revision 'exit.json') @{ exitCode = $pipeline.ExitCode; endedAt = (Get-Date -Format o); pipelinePid = $pipeline.Id }
    exit $pipeline.ExitCode
} catch {
    Write-Record (Join-Path $revision 'SUPERVISOR_FAILURE.json') @{ error = $_.ToString(); at = (Get-Date -Format o); supervisorPid = $PID }
    exit 1
}
