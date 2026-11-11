$ErrorActionPreference = 'Stop'
$experiment = 'C:\code\AncinetEmpires\ai_training\expert_iteration_2m_20261022'
$revision = Join-Path $experiment 'execution_v4'
function Save-Record($Path, $Value) {
    [IO.File]::WriteAllText($Path, ($Value | ConvertTo-Json -Depth 10), (New-Object Text.UTF8Encoding($false)))
}
try {
    Set-Location -LiteralPath 'C:\code\AncinetEmpires'
    $active = @(Get-CimInstance Win32_Process -Filter "Name='python.exe' OR Name='node.exe'" | Where-Object { $_.CommandLine -like '*expert_iteration_2m_20261022*' })
    if ($active.Count) { throw '仍有本实验的活动计算进程，拒绝重复启动' }
    if (Test-Path -LiteralPath (Join-Path $revision 'PROCESS.json')) { throw 'v4已有启动回执，拒绝无声重复启动' }
    # 独立托管保留全部失败证据，先补校验已完成的9局，再续跑。
    $pipeline = Start-Process -FilePath 'C:\Users\SHIINA\AppData\Local\Programs\Python\Python312\python.exe' -ArgumentList @('-B', '-X', 'utf8', (Join-Path $revision 'pipeline.py'), '--run') -WorkingDirectory 'C:\code\AncinetEmpires' -WindowStyle Hidden -RedirectStandardOutput (Join-Path $revision 'pipeline.stdout.log') -RedirectStandardError (Join-Path $revision 'pipeline.stderr.log') -PassThru
    $null = $pipeline.Handle
    $record = @{ pid = $pipeline.Id; launcherPid = $PID; startedAt = (Get-Date -Format o); executionRevision = 4; entry = 'execution_v4/pipeline.py --run'; plannedParents = 380; phase = '先流式重验9局，再续跑原计划'; hostedBy = '独立后台托管' }
    Save-Record (Join-Path $revision 'PROCESS.json') $record
    Save-Record (Join-Path $experiment 'PROCESS.json') $record
    $scheduleFile = Join-Path $experiment 'SCHEDULE_UPDATE.json'
    $schedule = Get-Content -LiteralPath $scheduleFile -Raw | ConvertFrom-Json
    $schedule.currentPipelinePid = $pipeline.Id
    $schedule.status = 'recovering_verification_v4'
    $schedule | Add-Member -NotePropertyName executionRevision -NotePropertyValue 4 -Force
    Save-Record $scheduleFile $schedule
    $pipeline.WaitForExit()
    Save-Record (Join-Path $revision 'exit.json') @{ exitCode = $pipeline.ExitCode; endedAt = (Get-Date -Format o); pipelinePid = $pipeline.Id }
    exit $pipeline.ExitCode
} catch {
    Save-Record (Join-Path $revision 'LAUNCHER_FAILURE.json') @{ error = $_.ToString(); at = (Get-Date -Format o); launcherPid = $PID }
    exit 1
}
