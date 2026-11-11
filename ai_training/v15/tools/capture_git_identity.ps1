# V15/T15-00：git 与环境采集（PowerShell 侧）
#
# 为什么需要这个脚本：
#   在当前 DSH 文件沙箱下，Node 的 child_process.spawnSync 被拒绝
#   （`spawnSync git EPERM`：无法打开命名管道），而 PowerShell 自身的管线不受影响。
#   因此 git 读数与 Python 解释器探测在这里完成，写成 JSON 交给
#   `v15/tools/identity_v15.mjs` 合并。本脚本只读仓库，不修改任何文件。
#
# 用法：
#   pwsh -File v15/tools/capture_git_identity.ps1 -OutDir v15/out/<runId>/T15-00 -Label start

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$OutDir,
    [string]$Label = 'start'
)

$ErrorActionPreference = 'Stop'
$repoRoot = (Get-Location).Path

function Invoke-Capture([string[]]$Command) {
    $exe = $Command[0]
    $rest = @()
    if ($Command.Length -gt 1) { $rest = $Command[1..($Command.Length - 1)] }
    try {
        $stdout = & $exe @rest 2>$null
        return @{ ok = $true; exitCode = $LASTEXITCODE; stdout = @($stdout) }
    } catch {
        return @{ ok = $false; exitCode = $null; stdout = @(); error = $_.Exception.Message }
    }
}

# ---- git ----
$head = Invoke-Capture @('git', 'rev-parse', 'HEAD')
$branch = Invoke-Capture @('git', 'rev-parse', '--abbrev-ref', 'HEAD')
$status = Invoke-Capture @('git', 'status', '--short')

# 未跟踪目录要展开成具体文件，`git status --short` 默认只给目录名。
$untrackedFiles = Invoke-Capture @('git', 'ls-files', '--others', '--exclude-standard')

$statusLines = @()
foreach ($line in $status.stdout) {
    if ($null -ne $line -and "$line".Length -gt 0) { $statusLines += "$line" }
}
$untrackedLines = @()
foreach ($line in $untrackedFiles.stdout) {
    if ($null -ne $line -and "$line".Length -gt 0) { $untrackedLines += "$line" }
}

$gitInfo = [ordered]@{
    schema          = 'v15_git_identity_1'
    generatedAt     = (Get-Date).ToUniversalTime().ToString('o')
    repoRoot        = $repoRoot
    head            = if ($head.ok -and $head.stdout.Count -gt 0) { "$($head.stdout[0])".Trim() } else { $null }
    branch          = if ($branch.ok -and $branch.stdout.Count -gt 0) { "$($branch.stdout[0])".Trim() } else { $null }
    revParseOk      = [bool]$head.ok
    statusOk        = [bool]$status.ok
    statusShort     = $statusLines
    untrackedFiles  = $untrackedLines
    commandErrors   = @($head.error, $branch.error, $status.error) | Where-Object { $_ }
}

# ---- Python 环境 ----
$probeScript = @'
import json, os, platform, sys
d = {
    "command": "py/python",
    "executable": sys.executable,
    "python": platform.python_version(),
    "impl": platform.python_implementation(),
    "cpuCount": os.cpu_count(),
}
try:
    import torch
    d["torch"] = torch.__version__
    d["cuda"] = bool(torch.cuda.is_available())
    d["cudaDeviceCount"] = int(torch.cuda.device_count())
    d["torchThreads"] = int(torch.get_num_threads())
except Exception as exc:
    d["torch"] = None
    d["torchError"] = "%s: %s" % (type(exc).__name__, exc)
try:
    import numpy
    d["numpy"] = numpy.__version__
except Exception as exc:
    d["numpy"] = None
    d["numpyError"] = "%s: %s" % (type(exc).__name__, exc)
print(json.dumps(d))
'@

$pyInfo = $null
$pyErrors = @()
foreach ($candidate in @('py', 'python', "$env:LOCALAPPDATA\Programs\Python\Python312\python.exe")) {
    if (-not $pyInfo) {
        try {
            $raw = & $candidate -c $probeScript 2>$null
            if ($LASTEXITCODE -eq 0 -and $raw) {
                $parsed = ($raw | Select-Object -Last 1) | ConvertFrom-Json
                $parsed | Add-Member -NotePropertyName command -NotePropertyValue $candidate -Force
                $pyInfo = $parsed
            } else {
                $pyErrors += "$candidate exit=$LASTEXITCODE"
            }
        } catch {
            $pyErrors += "$candidate error=$($_.Exception.Message)"
        }
    }
}

# ---- 机器信息 ----
$cpu = $null
$memGB = $null
try {
    $cpu = (Get-CimInstance Win32_Processor -ErrorAction Stop | Select-Object -First 1).Name
} catch {
    $cpu = $env:PROCESSOR_IDENTIFIER
}
try {
    $memGB = [math]::Round((Get-CimInstance Win32_ComputerSystem -ErrorAction Stop).TotalPhysicalMemory / 1GB, 2)
} catch {
    $memGB = $null
}

$machine = [ordered]@{
    platform        = 'win32'
    osCaption       = (Get-CimInstance Win32_OperatingSystem -ErrorAction SilentlyContinue).Caption
    osVersion       = [System.Environment]::OSVersion.VersionString
    logicalCpuCount = [System.Environment]::ProcessorCount
    cpuModel        = $cpu
    totalMemGB      = $memGB
    hostname        = $env:COMPUTERNAME
    pwsh            = $PSVersionTable.PSVersion.ToString()
    node            = (& node --version 2>$null)
}

$envInfo = [ordered]@{
    schema    = 'v15_env_capture_1'
    label     = $Label
    generatedAt = (Get-Date).ToUniversalTime().ToString('o')
    machine   = $machine
    python    = $pyInfo
    pythonProbeErrors = $pyErrors
    note      = 'torch/numpy 缺失时记 null 与真实错误，不写推测值。'
}

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

$gitPath = Join-Path $OutDir "git_identity_$Label.json"
$pyPath = Join-Path $OutDir "python_env_$Label.json"

if (Test-Path $gitPath) { throw "拒绝覆盖已存在的 git 身份文件：$gitPath" }
if (Test-Path $pyPath) { throw "拒绝覆盖已存在的环境文件：$pyPath" }

$gitInfo | ConvertTo-Json -Depth 6 | Set-Content -Path $gitPath -Encoding utf8
$envInfo | ConvertTo-Json -Depth 8 | Set-Content -Path $pyPath -Encoding utf8

Write-Output "[capture] head=$($gitInfo.head) branch=$($gitInfo.branch) statusLines=$($statusLines.Count) untrackedFiles=$($untrackedLines.Count)"
Write-Output "[capture] python=$(if ($pyInfo) { $pyInfo.executable } else { 'NOT FOUND' }) torch=$(if ($pyInfo) { $pyInfo.torch } else { 'n/a' })"
Write-Output "[capture] wrote $gitPath"
Write-Output "[capture] wrote $pyPath"
