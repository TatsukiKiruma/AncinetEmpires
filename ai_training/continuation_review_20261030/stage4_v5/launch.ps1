$ErrorActionPreference = 'Stop'
$workspace = 'C:\code\AncinetEmpires'
$dataRoot = 'D:\AncientEmpiresData\continuation_stage4_v5_20261101_v1'
$stamp = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
# 独立WMI隐藏宿主等待自己的控制器，不依赖工具会话保活。
$child = Start-Process -FilePath 'C:\Program Files\nodejs\node.exe' -ArgumentList @('ai_training/run.mjs', 'node', '--import', 'tsx', 'continuation_review_20261030/stage4_v5/controller.ts') -WorkingDirectory $workspace -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $dataRoot "controller-$stamp.stdout.log") -RedirectStandardError (Join-Path $dataRoot "controller-$stamp.stderr.log")
$child.WaitForExit()
exit $child.ExitCode
