$ErrorActionPreference = 'Stop'
$experiment = 'C:\code\AncinetEmpires\ai_training\expert_iteration_2m_20261022'
$revision = Join-Path $experiment 'execution_v5'
function Save-Record($Path,$Value) {
    [IO.File]::WriteAllText($Path,($Value | ConvertTo-Json -Depth 10),(New-Object Text.UTF8Encoding($false)))
}
try {
    Set-Location -LiteralPath 'C:\code\AncinetEmpires'
    $active = @(Get-CimInstance Win32_Process -Filter "Name='python.exe' OR Name='node.exe'" | Where-Object {$_.CommandLine -like '*expert_iteration_2m_20261022*'})
    if($active.Count){throw '仍有本实验计算进程，拒绝重复启动'}
    if(Test-Path -LiteralPath (Join-Path $revision 'PROCESS.json')){throw '本修订已有启动回执，拒绝无声重复启动'}
    $authorization = Get-Content -LiteralPath (Join-Path $revision 'resume-authorization.json') -Raw | ConvertFrom-Json
    if(-not $authorization.userExplicitlyResumed){throw '缺少用户明确恢复授权'}
    $pipeline = Start-Process -FilePath 'C:\Users\SHIINA\AppData\Local\Programs\Python\Python312\python.exe' -ArgumentList @('-B','-X','utf8',(Join-Path $revision 'pipeline.py'),'--run') -WorkingDirectory 'C:\code\AncinetEmpires' -WindowStyle Hidden -RedirectStandardOutput (Join-Path $revision 'pipeline.stdout.log') -RedirectStandardError (Join-Path $revision 'pipeline.stderr.log') -PassThru
    $null=$pipeline.Handle
    $record=@{pid=$pipeline.Id;launcherPid=$PID;startedAt=(Get-Date -Format o);executionRevision=5;entry='execution_v5/pipeline.py --run';plannedParents=191;firstGenerationQualifiedParents=131;excludedInterruptedParents=8;futureSamplingEach=@{hard=20;historical=10;self=0};historicalValidationGames=20;automaticExpansion=$false;hostedBy='独立后台托管'}
    Save-Record (Join-Path $revision 'PROCESS.json') $record
    Save-Record (Join-Path $experiment 'PROCESS.json') $record
    Save-Record (Join-Path $experiment 'SCHEDULE_UPDATE.json') $record
    $paused=Get-Content -LiteralPath (Join-Path $experiment 'PAUSED.json') -Raw | ConvertFrom-Json
    $paused.status='resumed_by_user'
    $paused | Add-Member -NotePropertyName resumedAt -NotePropertyValue (Get-Date -Format o) -Force
    $paused | Add-Member -NotePropertyName resumeAuthorization -NotePropertyValue 'execution_v5/resume-authorization.json' -Force
    Save-Record (Join-Path $experiment 'PAUSED.json') $paused
    $pipeline.WaitForExit()
    Save-Record (Join-Path $revision 'exit.json') @{exitCode=$pipeline.ExitCode;endedAt=(Get-Date -Format o);pipelinePid=$pipeline.Id}
    exit $pipeline.ExitCode
} catch {
    Save-Record (Join-Path $revision 'LAUNCHER_FAILURE.json') @{error=$_.ToString();at=(Get-Date -Format o);launcherPid=$PID}
    exit 1
}
