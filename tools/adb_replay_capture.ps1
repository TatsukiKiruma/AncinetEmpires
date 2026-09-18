<#
.SYNOPSIS
    MuMu 模拟器 AEII 回放抓包与本地缓存提取脚本。

.DESCRIPTION
    根据 APK 反编译结果，普通“多人游戏 -> 回放”会通过 /api/game_get 一次性取得
    C1258d.f2997k 动作数组，并不必然写成本地文件。只有进行中的多人对局在暂停、
    离开或断线续接时，才可能在应用私有目录下写入临时 .act：

      /data/user/0/net.toyknight.aeii.android/files/.aeii/cache-<账号>/<房间ID>.act

    “本地记录/攻略”使用 .wt：

      /data/user/0/net.toyknight.aeii.android/files/.aeii/cache-<账号>/C-<关卡>-<序号>.wt

    因此本脚本同时支持：
      - 启停 tcpdump，确认 HTTPS 流量是否经过 ae-multiplayer-na.toyknight.net
      - 配置/清理 Android 全局 HTTP(S) 代理，配合 mitmproxy/Fiddler 抓 /api/game_get
      - 扫描/拉取应用私有 .aeii 目录中的 .act/.wt/.sav/.aem 文件

.EXAMPLE
    .\tools\adb_replay_capture.ps1 find-files

.EXAMPLE
    .\tools\adb_replay_capture.ps1 pull-files

.EXAMPLE
    .\tools\adb_replay_capture.ps1 start -ForceStopGame

.EXAMPLE
    .\tools\adb_replay_capture.ps1 stop
#>

param(
    [ValidateSet('help', 'start', 'stop', 'status', 'pull', 'pull-pcap', 'find-files', 'pull-files', 'snapshot', 'proxy-on', 'proxy-off', 'proxy-status')]
    [string]$Action = 'status',

    [string]$Serial = '127.0.0.1:16384',

    [string]$AdbPath = '',

    [string]$Package = 'net.toyknight.aeii.android',

    [string]$RemotePcap = '/sdcard/Download/aeii_replay_capture.pcap',

    [string]$RemoteLog = '/sdcard/Download/aeii_tcpdump.log',

    [string]$RemotePid = '/sdcard/Download/aeii_tcpdump.pid',

    [string]$LocalDir = '',

    [string]$Interface = 'wlan0',

    [string]$ProxyHost = '10.0.2.2',

    [int]$ProxyPort = 8080,

    [switch]$ForceStopGame,

    [switch]$SkipPcapPull,

    [switch]$SkipReplayPull,

    [switch]$IncludeExternal
)

$ErrorActionPreference = 'Stop'

function Show-Help {
    Write-Host @'
用法:
  tools\adb_replay_capture.cmd status
  tools\adb_replay_capture.cmd find-files
  tools\adb_replay_capture.cmd pull-files
  tools\adb_replay_capture.cmd start -ForceStopGame
  tools\adb_replay_capture.cmd stop
  tools\adb_replay_capture.cmd proxy-on -ProxyPort 8080
  tools\adb_replay_capture.cmd proxy-off

动作:
  status       显示 tcpdump 状态，并扫描应用私有 .aeii 回放缓存
  find-files   只扫描 .act/.wt/.sav/.aem，不拉取
  pull-files   拉取 .act/.wt/.sav/.aem 到 captures\replay_files\<时间戳>
  start        启动 tcpdump，并记录一次回放缓存快照
  stop         停止 tcpdump，拉取 pcap，并拉取当前可见回放缓存
  pull-pcap    只拉取当前 pcap
  pull         pull-pcap 的兼容别名
  snapshot     保存当前回放缓存清单到 captures\replay_files
  proxy-on     设置模拟器全局 HTTP(S) 代理，默认 10.0.2.2:8080
  proxy-off    清理模拟器全局 HTTP(S) 代理
  proxy-status 查看当前代理设置

说明:
  普通远端回放数据在 HTTPS 的 /api/game_get 响应内，通常不会落成本地 .act。
  如果 find-files 没有结果，不能说明服务器没有回放，只说明 APK 当前没有本地缓存文件。
  APK 网络层使用宽松 TrustManager，通常可直接用 mitmproxy/Fiddler 拦截 HTTPS。
'@
}

function Resolve-RepoRoot {
    return (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
}

function Resolve-LocalDir {
    if ($LocalDir) {
        return (New-Item -ItemType Directory -Force -Path $LocalDir).FullName
    }

    $repoRoot = Resolve-RepoRoot
    return (New-Item -ItemType Directory -Force -Path (Join-Path $repoRoot 'captures')).FullName
}

function Resolve-ReplayOutputDir {
    $baseDir = Join-Path (Resolve-LocalDir) 'replay_files'
    return (New-Item -ItemType Directory -Force -Path $baseDir).FullName
}

function Resolve-Adb {
    if ($AdbPath) {
        if (-not (Test-Path -LiteralPath $AdbPath)) {
            throw "指定的 ADB 不存在：$AdbPath"
        }
        return (Resolve-Path -LiteralPath $AdbPath).Path
    }

    $candidates = @(
        'C:\Program Files\NetEase\MuMu\nx_device\15.0\shell\adb.exe',
        'C:\Program Files\NetEase\MuMu\nx_main\adb.exe',
        'C:\Program Files (x86)\Netease\MuMu\emulator\nemu\vmonitor\bin\adb_server.exe'
    )

    foreach ($candidate in $candidates) {
        if (Test-Path -LiteralPath $candidate) {
            return $candidate
        }
    }

    $pathAdb = Get-Command adb -ErrorAction SilentlyContinue
    if ($pathAdb) {
        return $pathAdb.Source
    }

    throw '找不到 adb.exe。请用 -AdbPath 指定 MuMu 或 Android SDK 的 adb.exe。'
}

function Invoke-Adb {
    param(
        [Parameter(Mandatory = $true)]
        [string[]]$Args
    )

    & $script:Adb @Args
}

function Ensure-Device {
    Write-Host "连接设备：$Serial"
    Invoke-Adb -Args @('connect', $Serial) | Write-Host
    Invoke-Adb -Args @('-s', $Serial, 'root') | Write-Host
    Invoke-Adb -Args @('connect', $Serial) | Write-Host

    $id = Invoke-Adb -Args @('-s', $Serial, 'shell', 'id')
    Write-Host "ADB 身份：$id"
}

function Get-AppPrivateRoots {
    $roots = @(
        "/data/user/0/$Package/files/.aeii",
        "/data/data/$Package/files/.aeii"
    )

    if ($IncludeExternal) {
        $roots += @(
            "/sdcard/Android/data/$Package/files/.aeii",
            "/storage/emulated/0/Android/data/$Package/files/.aeii"
        )
    }

    return $roots
}

function Get-ReplayFindCommand {
    $quotedRoots = (Get-AppPrivateRoots | ForEach-Object { "'$_'" }) -join ' '
    return "for d in $quotedRoots; do if [ -d `"$d`" ]; then find `"$d`" -type f \( -name '*.act' -o -name '*.wt' -o -name '*.sav' -o -name '*.aem' \); fi; done 2>/dev/null | sort -u"
}

function Get-RemoteReplayFiles {
    $command = Get-ReplayFindCommand
    $files = Invoke-Adb -Args @('-s', $Serial, 'shell', $command)
    return @($files | ForEach-Object { "$_".Trim() } | Where-Object { $_ })
}

function Convert-RemotePathToLocalName {
    param(
        [Parameter(Mandatory = $true)]
        [string]$RemotePath
    )

    $name = $RemotePath.TrimStart('/')
    $name = $name -replace '[/:*?"<>|\\]', '__'
    return $name
}

function Save-ReplaySnapshot {
    param(
        [string]$Label = 'snapshot'
    )

    Ensure-Device

    $timestamp = Get-Date -Format 'yyyyMMdd_HHmmss'
    $outDir = Resolve-ReplayOutputDir
    $snapshotPath = Join-Path $outDir "aeii_replay_files_${Label}_$timestamp.txt"
    $roots = Get-AppPrivateRoots
    $files = Get-RemoteReplayFiles

    $lines = @()
    $lines += "时间：$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
    $lines += "设备：$Serial"
    $lines += "包名：$Package"
    $lines += "扫描根目录："
    $lines += ($roots | ForEach-Object { "  $_" })
    $lines += ''
    $lines += "文件数量：$($files.Count)"
    $lines += ''
    $lines += $files

    Set-Content -LiteralPath $snapshotPath -Value $lines -Encoding UTF8
    Write-Host "已保存回放缓存快照：$snapshotPath"

    if ($files.Count -eq 0) {
        Write-Host '未发现 .act/.wt/.sav/.aem。远端多人回放通常不会自动落盘，这是符合 APK 逻辑的。'
    }
}

function Show-ReplayFiles {
    Ensure-Device

    Write-Host 'APK 本地目录规则：'
    Write-Host "  .act/.wt 位置：/data/user/0/$Package/files/.aeii/cache-<账号>/"
    Write-Host '  普通远端多人回放通常只在 /api/game_get 响应内，不会自动保存成本地 .act。'
    Write-Host ''

    Write-Host '扫描 .aeii 目录结构：'
    foreach ($root in Get-AppPrivateRoots) {
        Write-Host "  $root"
        Invoke-Adb -Args @('-s', $Serial, 'shell', "find '$root' -maxdepth 4 -print 2>/dev/null | sed -n '1,120p' || true") | Write-Host
    }

    Write-Host ''
    Write-Host '查找 .act/.wt/.sav/.aem：'
    $files = Get-RemoteReplayFiles
    if ($files.Count -eq 0) {
        Write-Host '  未发现本地回放缓存文件。'
        Write-Host '  如果你只是查看远端多人回放，这是预期结果；需要 HTTPS 解密代理或运行时 Hook 才能拿到 /api/game_get 内的 C0578b[]。'
        return
    }

    foreach ($file in $files) {
        Invoke-Adb -Args @('-s', $Serial, 'shell', "ls -la '$file' 2>/dev/null || true") | Write-Host
    }
}

function Pull-ReplayFiles {
    Ensure-Device

    $files = Get-RemoteReplayFiles
    if ($files.Count -eq 0) {
        Write-Host '未发现可拉取的 .act/.wt/.sav/.aem。'
        Write-Host '提示：普通远端多人回放不会自动写成本地 .act；如果要拿完整回放，需要拦截 /api/game_get HTTPS 响应。'
        return
    }

    $timestamp = Get-Date -Format 'yyyyMMdd_HHmmss'
    $outRoot = New-Item -ItemType Directory -Force -Path (Join-Path (Resolve-ReplayOutputDir) $timestamp)

    Write-Host "拉取回放相关文件到：$($outRoot.FullName)"
    foreach ($file in $files) {
        $localName = Convert-RemotePathToLocalName -RemotePath $file
        $localPath = Join-Path $outRoot.FullName $localName
        Write-Host "  $file"
        Invoke-Adb -Args @('-s', $Serial, 'pull', $file, $localPath) | Write-Host
    }

    Get-ChildItem -LiteralPath $outRoot.FullName -File |
        Select-Object FullName, Length, LastWriteTime |
        Format-Table -AutoSize
}

function Enable-Proxy {
    Ensure-Device

    $proxy = "${ProxyHost}:${ProxyPort}"
    Write-Host "设置模拟器全局代理：$proxy"
    Invoke-Adb -Args @('-s', $Serial, 'shell', "settings put global http_proxy $proxy") | Write-Host
    Invoke-Adb -Args @('-s', $Serial, 'shell', "settings put global global_http_proxy_host $ProxyHost") | Write-Host
    Invoke-Adb -Args @('-s', $Serial, 'shell', "settings put global global_http_proxy_port $ProxyPort") | Write-Host

    Show-ProxyStatus
    Write-Host ''
    Write-Host '下一步：'
    Write-Host "  1. 在 Windows 上启动 mitmproxy/Fiddler，监听 0.0.0.0:$ProxyPort"
    Write-Host '  2. 在游戏“多人游戏”里重新打开目标回放'
    Write-Host '  3. 在代理工具中搜索 /api/game_get，响应体就是包含 C1258d.f2997k 的二进制对象流'
    Write-Host '  4. 完成后执行：tools\adb_replay_capture.cmd proxy-off'
}

function Disable-Proxy {
    Ensure-Device

    Write-Host '清理模拟器全局代理'
    Invoke-Adb -Args @('-s', $Serial, 'shell', 'settings delete global http_proxy') | Write-Host
    Invoke-Adb -Args @('-s', $Serial, 'shell', 'settings delete global global_http_proxy_host') | Write-Host
    Invoke-Adb -Args @('-s', $Serial, 'shell', 'settings delete global global_http_proxy_port') | Write-Host
    Invoke-Adb -Args @('-s', $Serial, 'shell', 'settings delete global global_http_proxy_exclusion_list') | Write-Host
    Invoke-Adb -Args @('-s', $Serial, 'shell', 'settings delete global global_proxy_pac_url') | Write-Host

    Show-ProxyStatus
}

function Show-ProxyStatus {
    Ensure-Device

    Write-Host '当前代理设置：'
    Invoke-Adb -Args @('-s', $Serial, 'shell', 'settings get global http_proxy') | Write-Host
    Invoke-Adb -Args @('-s', $Serial, 'shell', 'settings get global global_http_proxy_host') | Write-Host
    Invoke-Adb -Args @('-s', $Serial, 'shell', 'settings get global global_http_proxy_port') | Write-Host
    Invoke-Adb -Args @('-s', $Serial, 'shell', 'settings get global global_proxy_pac_url') | Write-Host
}

function Start-Capture {
    Ensure-Device
    Save-ReplaySnapshot -Label 'before_start'

    if ($ForceStopGame) {
        Write-Host "强制停止游戏，便于抓到完整 DNS/TLS 握手：$Package"
        Invoke-Adb -Args @('-s', $Serial, 'shell', "am force-stop $Package") | Write-Host
    }

    Write-Host '清理旧抓包文件'
    Invoke-Adb -Args @('-s', $Serial, 'shell', "rm -f $RemotePcap $RemoteLog $RemotePid") | Write-Host

    Write-Host "启动 tcpdump：接口=$Interface，文件=$RemotePcap"
    $command = "sh -c `"nohup /system/bin/tcpdump -i $Interface -s 0 -w $RemotePcap >$RemoteLog 2>&1 & echo `$! >$RemotePid`""
    Invoke-Adb -Args @('-s', $Serial, 'shell', $command) | Write-Host

    Show-Status
    Write-Host ''
    Write-Host '现在请手动打开游戏并重新加载回放。完成后执行：'
    Write-Host '  tools\adb_replay_capture.cmd stop'
}

function Stop-Capture {
    Ensure-Device

    Write-Host '停止 tcpdump'
    Invoke-Adb -Args @('-s', $Serial, 'shell', 'pkill tcpdump || killall tcpdump || true') | Write-Host
    Start-Sleep -Seconds 2

    Show-Status

    if (-not $SkipPcapPull) {
        Pull-Capture
    }

    if (-not $SkipReplayPull) {
        Pull-ReplayFiles
    }
}

function Pull-Capture {
    Ensure-Device

    $outDir = Resolve-LocalDir
    $timestamp = Get-Date -Format 'yyyyMMdd_HHmmss'
    $localPcap = Join-Path $outDir "aeii_replay_capture_$timestamp.pcap"
    $localLog = Join-Path $outDir "aeii_tcpdump_$timestamp.log"

    Write-Host "拉取 pcap 到：$localPcap"
    Invoke-Adb -Args @('-s', $Serial, 'pull', $RemotePcap, $localPcap) | Write-Host

    Write-Host "拉取 tcpdump 日志到：$localLog"
    Invoke-Adb -Args @('-s', $Serial, 'pull', $RemoteLog, $localLog) | Write-Host

    Get-Item -LiteralPath $localPcap | Select-Object FullName, Length, LastWriteTime | Format-List
    Write-Host "后续可用 Wireshark 或 npm run pcap:replay-probe 分析：$localPcap"
}

function Show-Status {
    Ensure-Device

    Write-Host 'tcpdump 进程：'
    Invoke-Adb -Args @('-s', $Serial, 'shell', 'ps -A | grep tcpdump || true') | Write-Host

    Write-Host '远端抓包文件：'
    Invoke-Adb -Args @('-s', $Serial, 'shell', "ls -la $RemotePcap $RemoteLog $RemotePid 2>/dev/null || true") | Write-Host

    Write-Host 'tcpdump 日志：'
    Invoke-Adb -Args @('-s', $Serial, 'shell', "cat $RemoteLog 2>/dev/null || true") | Write-Host

    Write-Host ''
    Write-Host '本地回放缓存概览：'
    $files = Get-RemoteReplayFiles
    if ($files.Count -eq 0) {
        Write-Host '  未发现 .act/.wt/.sav/.aem。'
    } else {
        foreach ($file in $files) {
            Write-Host "  $file"
        }
    }
}

if ($Action -eq 'help') {
    Show-Help
    exit 0
}

$script:Adb = Resolve-Adb
Write-Host "使用 ADB：$script:Adb"

switch ($Action) {
    'start' { Start-Capture }
    'stop' { Stop-Capture }
    'status' { Show-Status }
    'pull' { Pull-Capture }
    'pull-pcap' { Pull-Capture }
    'find-files' { Show-ReplayFiles }
    'pull-files' { Pull-ReplayFiles }
    'snapshot' { Save-ReplaySnapshot }
    'proxy-on' { Enable-Proxy }
    'proxy-off' { Disable-Proxy }
    'proxy-status' { Show-ProxyStatus }
}
