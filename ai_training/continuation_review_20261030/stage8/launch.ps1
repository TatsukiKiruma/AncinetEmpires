# 隐藏启动独立 Stage 8 控制器，所有运行数据写入指定 D 盘目录。
$ErrorActionPreference = 'Stop'
$repo = 'C:\code\AncinetEmpires'
$stage = Join-Path $repo 'ai_training\continuation_review_20261030\stage8'
$data = 'D:\AncientEmpiresData\continuation_stage8_20261110_v1'
New-Item -ItemType Directory -Force $data | Out-Null
if (Test-Path -LiteralPath (Join-Path $data 'controller.lock')) { throw 'Stage 8 控制器锁已存在，禁止重复启动' }
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$node = (Get-Command node).Source
$process = Start-Process -FilePath $node -ArgumentList @('--import', 'tsx', (Join-Path $stage 'run.ts')) -WorkingDirectory $repo -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $data "controller-$stamp.log") -RedirectStandardError (Join-Path $data "controller-$stamp.err")
@{ pid = $process.Id; launchedAt = (Get-Date).ToUniversalTime().ToString('o'); data = $data; stage = $stage } | ConvertTo-Json | Set-Content -Encoding utf8 (Join-Path $stage 'LAUNCH.json')
Get-Content (Join-Path $stage 'LAUNCH.json')
