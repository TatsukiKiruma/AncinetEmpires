# 只采集本阶段Node/Python进程；监测开始前的资源用量明确不补造。
$stageRoot = Split-Path $PSScriptRoot -Parent
$seenCpu = @{}
$totalCpu = 0.0
$peakMemory = 0L
$startedAt = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
while (-not (Test-Path -LiteralPath (Join-Path $stageRoot 'identity/resource_monitor_stop'))) {
    $memoryNow = 0L
    $processRows = @()
    $candidateProcesses = Get-CimInstance Win32_Process -Filter "Name='node.exe' OR Name='python.exe'" | Where-Object { $_.CommandLine -like '*r8_pure_policy_stage_20261014_125300*' }
    foreach ($item in $candidateProcesses) {
        $proc = Get-Process -Id $item.ProcessId -ErrorAction SilentlyContinue
        if ($null -eq $proc) { continue }
        $key = "$($proc.Id)-$($item.CreationDate)"
        $cpuNow = [double]$proc.CPU
        if ($seenCpu.ContainsKey($key)) { $totalCpu += [Math]::Max(0, $cpuNow - $seenCpu[$key]) }
        $seenCpu[$key] = $cpuNow
        $memoryNow += $proc.WorkingSet64
        $processRows += @{ pid=$proc.Id; cpuSeconds=$cpuNow; workingSetBytes=$proc.WorkingSet64 }
    }
    $peakMemory = [Math]::Max($peakMemory, $memoryNow)
    @{ startedUnix=$startedAt; checkedUnix=[DateTimeOffset]::UtcNow.ToUnixTimeSeconds(); cpuSecondsObservedLowerBound=$totalCpu; peakConcurrentWorkingSetBytes=$peakMemory; processes=$processRows; limitation='前期未采集；轮询间启动退出的短进程可能遗漏；此值不是整个阶段精确总CPU时间。' } | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $stageRoot 'identity/resources_observed.json') -Encoding utf8
    Start-Sleep -Seconds 10
}
