$ErrorActionPreference = 'Stop'
$experiment = 'C:\code\AncinetEmpires\ai_training\expert_iteration_2m_20261022'
$attempt = Join-Path $experiment 'process-supervision\attempt02'
Set-Location -LiteralPath 'C:\code\AncinetEmpires'
# 启动器由系统进程服务托管，避免聊天命令会话结束时连带终止训练。
@{ launcherPid = $PID; startedAt = (Get-Date -Format o); entry = 'pipeline.py --run'; resumed = $true } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $attempt 'started.json') -Encoding UTF8
try {
    $trainer = Start-Process -FilePath 'C:\Users\SHIINA\AppData\Local\Programs\Python\Python312\python.exe' -ArgumentList @('-B', '-X', 'utf8', (Join-Path $experiment 'pipeline.py'), '--run') -WorkingDirectory 'C:\code\AncinetEmpires' -WindowStyle Hidden -RedirectStandardOutput (Join-Path $attempt 'pipeline.stdout.log') -RedirectStandardError (Join-Path $attempt 'pipeline.stderr.log') -PassThru
    @{ pid = $trainer.Id; launcherPid = $PID; startedAt = (Get-Date -Format o); entry = 'pipeline.py --run'; hostedBy = 'WMI独立后台启动器'; attempt = 'attempt02' } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $attempt 'PROCESS.json') -Encoding UTF8
    $trainer.WaitForExit()
    @{ exitCode = $trainer.ExitCode; endedAt = (Get-Date -Format o); pid = $trainer.Id } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $attempt 'exit.json') -Encoding UTF8
    exit $trainer.ExitCode
} catch {
    @{ error = $_.ToString(); endedAt = (Get-Date -Format o); launcherPid = $PID } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $attempt 'launcher-error.json') -Encoding UTF8
    exit 1
}
