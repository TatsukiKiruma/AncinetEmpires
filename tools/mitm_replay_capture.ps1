<#
.SYNOPSIS
    启停 AEII 多人远端回放 HTTPS 代理抓取。

.DESCRIPTION
    使用 mitmdump 监听 0.0.0.0:<Port>，显式关闭 mitmproxy 的 block_global，
    然后把 MuMu 全局代理切到该端口。抓到 /api/game_get 响应后，
    tools/mitm_aeii_replay_dump.py 会把原始响应保存到 captures/mitm_replay/<时间戳>/。
    停止抓包时会自动调用 tools/apk_game_get_report.ts，输出报告并导出明文 .act。
#>

param(
    [ValidateSet('run', 'start', 'stop', 'status', 'proxy-off', 'report')]
    [string]$Action = 'status',

    [int]$Port = 18080,

    [string]$Serial = '127.0.0.1:16384',

    [string]$Package = 'net.toyknight.aeii.android',

    [string]$ReportDir = '',

    [ValidateRange(1, 1000)]
    [int]$ReportSample = 8,

    [switch]$JsonReport,

    [switch]$NoAutoReport,

    [switch]$NoExportReplay,

    [switch]$SaveFlows,

    [switch]$BatchDownloadList,

    [ValidateRange(1, 100)]
    [int]$BatchMaxPerPage = 20
)

$ErrorActionPreference = 'Stop'

function Resolve-RepoRoot {
    return (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
}

function Resolve-Pwsh {
    $candidate = 'C:\Program Files\PowerShell\7\pwsh.exe'
    if (Test-Path -LiteralPath $candidate) {
        return $candidate
    }
    return 'pwsh'
}

function Resolve-MitmDump {
    $repoRoot = Resolve-RepoRoot
    $local = Join-Path $repoRoot '.venv-mitm\Scripts\mitmdump.exe'
    if (Test-Path -LiteralPath $local) {
        return $local
    }

    $cmd = Get-Command mitmdump -ErrorAction SilentlyContinue
    if ($cmd) {
        return $cmd.Source
    }

    throw '找不到 mitmdump。请先安装：python -m venv .venv-mitm；.\.venv-mitm\Scripts\python.exe -m pip install mitmproxy'
}

function Resolve-Node {
    $cmd = Get-Command node -ErrorAction SilentlyContinue
    if ($cmd) {
        return $cmd.Source
    }

    throw '找不到 node。请先安装项目依赖并确认 node 在 PATH 中。'
}

function Get-StateDir {
    $repoRoot = Resolve-RepoRoot
    return (New-Item -ItemType Directory -Force -Path (Join-Path $repoRoot 'captures\mitm_replay')).FullName
}

function Get-PidFile {
    return Join-Path (Get-StateDir) 'aeii_mitmdump.pid'
}

function Get-LastDirFile {
    return Join-Path (Get-StateDir) 'aeii_mitmdump_last_dir.txt'
}

function Resolve-ReportTargetDir {
    if ($ReportDir) {
        return (Resolve-Path -LiteralPath $ReportDir).Path
    }

    $lastDirFile = Get-LastDirFile
    if (Test-Path -LiteralPath $lastDirFile) {
        $dir = (Get-Content -LiteralPath $lastDirFile -Raw).Trim()
        if ($dir -and (Test-Path -LiteralPath $dir)) {
            return (Resolve-Path -LiteralPath $dir).Path
        }
    }

    throw '没有可分析的最近输出目录。请先 run/start 抓包，或传入 -ReportDir <目录>。'
}

function Invoke-ReplayProxyScript {
    param(
        [Parameter(Mandatory = $true)]
        [string[]]$Args
    )

    $repoRoot = Resolve-RepoRoot
    $script = Join-Path $repoRoot 'tools\adb_replay_capture.ps1'
    $pwsh = Resolve-Pwsh
    & $pwsh -NoProfile -ExecutionPolicy Bypass -File $script @Args
}

function Test-PortListening {
    param(
        [Parameter(Mandatory = $true)]
        [int]$ListenPort
    )

    $pattern = "LISTENING"
    $lines = & netstat -ano
    foreach ($line in $lines) {
        if ($line -match "[:.]$ListenPort\s" -and $line -match $pattern) {
            return $true
        }
    }
    return $false
}

function Stop-ReplayProxyOnly {
    Invoke-ReplayProxyScript -Args @('proxy-off', '-Serial', $Serial, '-Package', $Package)
}

function Set-MitmEnvironment {
    param(
        [Parameter(Mandatory = $true)]
        [string]$OutputDir
    )

    [Environment]::SetEnvironmentVariable('AEII_MITM_OUT_DIR', $OutputDir, 'Process')
    [Environment]::SetEnvironmentVariable('AEII_MITM_BATCH_CLOSED_ONLY', '1', 'Process')
    [Environment]::SetEnvironmentVariable('AEII_MITM_BATCH_MAX_PER_PAGE', "$BatchMaxPerPage", 'Process')
    if ($BatchDownloadList) {
        [Environment]::SetEnvironmentVariable('AEII_MITM_BATCH_GAME_LIST', '1', 'Process')
    } else {
        [Environment]::SetEnvironmentVariable('AEII_MITM_BATCH_GAME_LIST', '0', 'Process')
    }
}

function Get-GameGetFiles {
    param(
        [Parameter(Mandatory = $true)]
        [string]$OutputDir
    )

    if (-not (Test-Path -LiteralPath $OutputDir)) {
        return @()
    }

    return @(Get-ChildItem -LiteralPath $OutputDir -Filter 'game_get_*.bin' -File -ErrorAction SilentlyContinue |
        Sort-Object Name)
}

function Invoke-GameGetReport {
    param(
        [Parameter(Mandatory = $true)]
        [string]$OutputDir
    )

    $gameGetFiles = Get-GameGetFiles -OutputDir $OutputDir
    if ($gameGetFiles.Count -eq 0) {
        Write-Host ''
        Write-Host "未在输出目录发现 game_get_*.bin：$OutputDir"
        Write-Host '请确认已经进入“多人游戏 -> 回放”，并且 mitmproxy 终端出现 [AEII] 已保存 /api/game_get 响应。'
        return
    }

    $repoRoot = Resolve-RepoRoot
    $node = Resolve-Node
    $reportScript = Join-Path $repoRoot 'tools\apk_game_get_report.ts'
    $reportPath = Join-Path $OutputDir ($(if ($JsonReport) { 'replay_report.json' } else { 'replay_report.md' }))

    $args = @(
        '--openssl-legacy-provider',
        '--import', 'tsx',
        $reportScript,
        '--dir', $OutputDir,
        '--all',
        '--sample', "$ReportSample"
    )
    if ($JsonReport) {
        $args += '--json'
    }
    if ($NoExportReplay) {
        $args += '--no-export'
    }

    Write-Host ''
    Write-Host "开始解析 /api/game_get 响应：$OutputDir"
    Write-Host "发现响应文件：$($gameGetFiles.Count) 个"

    Push-Location $repoRoot
    try {
        $reportLines = & $node @args 2>&1
        $exitCode = $LASTEXITCODE
    } finally {
        Pop-Location
    }

    $reportText = @($reportLines | ForEach-Object { "$_" })
    Set-Content -LiteralPath $reportPath -Value $reportText -Encoding UTF8
    $reportText | ForEach-Object { Write-Host $_ }

    Write-Host ''
    Write-Host "已保存解析报告：$reportPath"
    if (-not $NoExportReplay) {
        $acts = @(Get-ChildItem -LiteralPath $OutputDir -Filter '*.replay.plain.act' -File -ErrorAction SilentlyContinue |
            Sort-Object Name)
        if ($acts.Count -gt 0) {
            Write-Host '已导出明文回放 ACT：'
            foreach ($act in $acts) {
                Write-Host "  $($act.FullName)"
            }
        }
    }

    if ($exitCode -ne 0) {
        throw "回放响应解析失败，退出码：$exitCode"
    }
}

function New-MitmArgs {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Addon,

        [Parameter(Mandatory = $true)]
        [string]$FlowFile
    )

    $args = @(
        '--mode', 'regular',
        '--listen-host', '0.0.0.0',
        '--listen-port', "$Port",
        '--set', 'block_global=false',
        '--set', 'block_private=false',
        '--set', 'ssl_insecure=true',
        '--set', 'stream_large_bodies=20m',
        '-s', $Addon
    )

    if ($SaveFlows) {
        $args += @('-w', $FlowFile)
    }

    return $args
}

function Show-Status {
    $pidFile = Get-PidFile
    if (Test-Path -LiteralPath $pidFile) {
        $pidText = (Get-Content -LiteralPath $pidFile -Raw).Trim()
        $proc = Get-Process -Id ([int]$pidText) -ErrorAction SilentlyContinue
        if ($proc) {
            Write-Host "mitmdump 运行中：PID=$pidText"
        } else {
            Write-Host "PID 文件存在，但进程未运行：$pidText"
        }
    } else {
        Write-Host 'mitmdump 未由本脚本启动，或没有 PID 文件。'
    }

    $lastDirFile = Get-LastDirFile
    if (Test-Path -LiteralPath $lastDirFile) {
        $dir = (Get-Content -LiteralPath $lastDirFile -Raw).Trim()
        Write-Host "最近输出目录：$dir"
        if (Test-Path -LiteralPath $dir) {
            Get-ChildItem -LiteralPath $dir -File | Select-Object Name, Length, LastWriteTime | Format-Table -AutoSize
        }
    }

    Invoke-ReplayProxyScript -Args @('proxy-status', '-Serial', $Serial, '-Package', $Package)
}

function Start-Capture {
    $repoRoot = Resolve-RepoRoot
    $mitmdump = Resolve-MitmDump
    $timestamp = Get-Date -Format 'yyyyMMdd_HHmmss'
    $outDir = New-Item -ItemType Directory -Force -Path (Join-Path (Get-StateDir) $timestamp)
    $addon = Join-Path $repoRoot 'tools\mitm_aeii_replay_dump.py'
    $flowFile = Join-Path $outDir.FullName 'all_flows.mitm'
    $stdoutLog = Join-Path $outDir.FullName 'mitmdump.out.log'
    $stderrLog = Join-Path $outDir.FullName 'mitmdump.err.log'
    $pidFile = Get-PidFile

    if (Test-PortListening -ListenPort $Port) {
        throw "端口 $Port 已被占用。请换端口，例如：tools\mitm_replay_capture.cmd start -Port 18081"
    }

    Set-MitmEnvironment -OutputDir $outDir.FullName
    Set-Content -LiteralPath (Get-LastDirFile) -Value $outDir.FullName -Encoding UTF8

    $args = New-MitmArgs -Addon $addon -FlowFile $flowFile

    Write-Host "启动 mitmdump：$mitmdump"
    Write-Host "输出目录：$($outDir.FullName)"
    if ($BatchDownloadList) {
        Write-Host "批量下载：已启用。每个 game_list 页面最多自动请求 $BatchMaxPerPage 条 CLOSED 回放。"
    }
    if ($SaveFlows) {
        Write-Host "完整 flow 文件：$flowFile"
    } else {
        Write-Host '默认不保存完整 all_flows.mitm，仅保存 /api/game_get 响应体和元数据。'
    }
    $proc = Start-Process -FilePath $mitmdump `
        -ArgumentList $args `
        -WorkingDirectory $repoRoot `
        -RedirectStandardOutput $stdoutLog `
        -RedirectStandardError $stderrLog `
        -WindowStyle Hidden `
        -PassThru

    Set-Content -LiteralPath $pidFile -Value $proc.Id -Encoding ASCII
    Set-Content -LiteralPath (Get-LastDirFile) -Value $outDir.FullName -Encoding UTF8

    Start-Sleep -Seconds 2
    if (-not (Test-PortListening -ListenPort $Port)) {
        throw "mitmdump 未能监听端口 $Port。请查看日志：$stdoutLog / $stderrLog"
    }

    Invoke-ReplayProxyScript -Args @('proxy-on', '-Serial', $Serial, '-Package', $Package, '-ProxyPort', "$Port")

    Write-Host ''
    Write-Host '现在在 MuMu 中打开：多人游戏 -> 目标对局 -> 回放。'
    Write-Host '抓到后会出现文件：game_get_*.bin'
    if ($BatchDownloadList) {
        Write-Host '批量模式下：切到“已结束”列表并翻页即可，每页列表会自动下载 CLOSED 回放。'
    }
    Write-Host '完成后执行：tools\mitm_replay_capture.cmd stop'
    Write-Host 'stop 会自动生成 replay_report.md，并导出 *.replay.plain.act。'
}

function Run-CaptureForeground {
    $repoRoot = Resolve-RepoRoot
    $mitmdump = Resolve-MitmDump
    $timestamp = Get-Date -Format 'yyyyMMdd_HHmmss'
    $outDir = New-Item -ItemType Directory -Force -Path (Join-Path (Get-StateDir) $timestamp)
    $addon = Join-Path $repoRoot 'tools\mitm_aeii_replay_dump.py'
    $flowFile = Join-Path $outDir.FullName 'all_flows.mitm'

    if (Test-PortListening -ListenPort $Port) {
        throw "端口 $Port 已被占用。请换端口，例如：tools\mitm_replay_capture.cmd run -Port 18081"
    }

    Set-MitmEnvironment -OutputDir $outDir.FullName
    Set-Content -LiteralPath (Get-LastDirFile) -Value $outDir.FullName -Encoding UTF8

    $args = New-MitmArgs -Addon $addon -FlowFile $flowFile

    Write-Host "输出目录：$($outDir.FullName)"
    if ($BatchDownloadList) {
        Write-Host "批量下载：已启用。每个 game_list 页面最多自动请求 $BatchMaxPerPage 条 CLOSED 回放。"
    }
    if ($SaveFlows) {
        Write-Host "完整 flow 文件：$flowFile"
    } else {
        Write-Host '默认不保存完整 all_flows.mitm，仅保存 /api/game_get 响应体和元数据。'
    }
    Write-Host "设置 MuMu 代理到 10.0.2.2:$Port"
    Invoke-ReplayProxyScript -Args @('proxy-on', '-Serial', $Serial, '-Package', $Package, '-ProxyPort', "$Port")
    Write-Host ''
    Write-Host 'mitmdump 将在当前终端前台运行。看到 Proxy server listening 后，在 MuMu 中打开多人游戏回放。'
    if ($BatchDownloadList) {
        Write-Host '进入“已结束”列表并翻页即可；每个 game_list 页面会自动批量请求 CLOSED 回放。'
    }
    Write-Host '抓到 /api/game_get 后会自动保存 game_get_*.bin。结束时按 Ctrl+C，会自动清理代理并生成报告。'
    Write-Host ''

    try {
        & $mitmdump @args
    } finally {
        Stop-ReplayProxyOnly
        if (-not $NoAutoReport) {
            Invoke-GameGetReport -OutputDir $outDir.FullName
        }
        Write-Host "输出目录：$($outDir.FullName)"
    }
}

function Stop-Capture {
    Stop-ReplayProxyOnly

    $pidFile = Get-PidFile
    if (Test-Path -LiteralPath $pidFile) {
        $pidText = (Get-Content -LiteralPath $pidFile -Raw).Trim()
        $proc = Get-Process -Id ([int]$pidText) -ErrorAction SilentlyContinue
        if ($proc) {
            Write-Host "停止 mitmdump：PID=$pidText"
            Stop-Process -Id ([int]$pidText)
        }
    }

    Show-Status

    if (-not $NoAutoReport) {
        $targetDir = Resolve-ReportTargetDir
        Invoke-GameGetReport -OutputDir $targetDir
    }
}

switch ($Action) {
    'run' { Run-CaptureForeground }
    'start' { Start-Capture }
    'stop' { Stop-Capture }
    'status' { Show-Status }
    'proxy-off' { Stop-ReplayProxyOnly }
    'report' {
        $targetDir = Resolve-ReportTargetDir
        Invoke-GameGetReport -OutputDir $targetDir
    }
}
