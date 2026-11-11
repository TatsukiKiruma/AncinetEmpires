$ErrorActionPreference = 'Stop'
$workspace = 'C:\code\AncinetEmpires'
$dataRoot = 'D:\AncientEmpiresData\continuation_stage4_20261031_v1'
$stdoutFile = Join-Path $dataRoot 'controller-recovery-v4.stdout.log'
$stderrFile = Join-Path $dataRoot 'controller-recovery-v4.stderr.log'
if ((Test-Path -LiteralPath $stdoutFile) -or (Test-Path -LiteralPath $stderrFile)) { throw '禁止重复启动或覆盖接续日志' }
# 本脚本由独立WMI宿主启动；只等待自己的子进程，所有窗口隐藏。
$child = Start-Process -FilePath 'C:\Program Files\nodejs\node.exe' -ArgumentList @('ai_training/run.mjs', 'node', '--import', 'tsx', 'continuation_review_20261030/stage4/recovery_v4_controller.ts') -WorkingDirectory $workspace -WindowStyle Hidden -PassThru -RedirectStandardOutput $stdoutFile -RedirectStandardError $stderrFile
$child.WaitForExit()
exit $child.ExitCode
