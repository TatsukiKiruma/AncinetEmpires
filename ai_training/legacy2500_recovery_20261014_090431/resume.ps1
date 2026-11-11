$ErrorActionPreference = 'Stop'
$taskRoot = [IO.Path]::GetFullPath($PSScriptRoot)
$repoRoot = [IO.Path]::GetFullPath((Join-Path $taskRoot '../..'))
$env:OMP_NUM_THREADS = '1'
$env:MKL_NUM_THREADS = '1'
$env:OPENBLAS_NUM_THREADS = '1'
$env:NUMEXPR_NUM_THREADS = '1'
$env:CUDA_VISIBLE_DEVICES = '-1'
$env:TSX_DISABLE_CACHE = '1'
$env:PYTHONDONTWRITEBYTECODE = '1'
$env:TEMP = Join-Path $taskRoot 'cache'
$env:TMP = $env:TEMP
New-Item -ItemType Directory -Force -Path $env:TEMP | Out-Null
Set-Location -LiteralPath $repoRoot
# 单个子进程串行运行，累计重计算预算四小时；只终止本脚本创建的子进程。
$watch = [Diagnostics.Stopwatch]::StartNew()
function Invoke-TaskStep([string]$executable, [string[]]$arguments) {
    $remaining = 14400 - $watch.Elapsed.TotalSeconds
    if ($remaining -le 0) { throw '四小时预算已用完；保留断点' }
    $info = [Diagnostics.ProcessStartInfo]::new()
    $info.FileName = $executable
    $info.UseShellExecute = $false
    $info.CreateNoWindow = $true
    $info.WorkingDirectory = $repoRoot
    foreach ($arg in $arguments) { [void]$info.ArgumentList.Add($arg) }
    $child = [Diagnostics.Process]::Start($info)
    try { $child.PriorityClass = 'BelowNormal' } catch { }
    if (-not $child.WaitForExit([int]($remaining * 1000))) {
        $child.Kill()
        throw '四小时预算耗尽；只停止本任务子进程，保留已写断点'
    }
    if ($child.ExitCode -ne 0) { throw "本任务步骤失败：$executable $arguments" }
}
if (-not (Test-Path -LiteralPath (Join-Path $taskRoot 'freeze_manifest.json'))) {
    Invoke-TaskStep 'node' @((Join-Path $taskRoot 'prepare.mjs'))
}
if (-not (Test-Path -LiteralPath (Join-Path $taskRoot 'episode_index.jsonl'))) {
    Invoke-TaskStep 'node' @((Join-Path $taskRoot 'inventory.mjs'))
}
Invoke-TaskStep 'node' @('--import','tsx',(Join-Path $taskRoot 'checks.ts'))
Invoke-TaskStep 'node' @('--import','tsx',(Join-Path $taskRoot 'audit_replay.ts'),'1395')
Invoke-TaskStep 'node' @('--import','tsx',(Join-Path $taskRoot 'relabel_snapshots.ts'),'2000')
Invoke-TaskStep 'node' @('--openssl-legacy-provider','--import','tsx',(Join-Path $taskRoot 'post_validate.ts'))
Invoke-TaskStep 'python' @((Join-Path $taskRoot 'audit_archives.py'))
Invoke-TaskStep 'node' @('--import','tsx',(Join-Path $taskRoot 'package.ts'))
Invoke-TaskStep 'node' @('--import','tsx',(Join-Path $taskRoot 'verify_package.ts'))
Write-Output '候选包已重建并核验；未启动训练。'
