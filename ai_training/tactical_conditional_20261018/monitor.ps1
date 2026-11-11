$taskDir = $PSScriptRoot
$ErrorActionPreference = 'Stop'
while ($true) {
    $phase = Get-Content (Join-Path $taskDir 'PIPELINE_STATE.json') -Raw | ConvertFrom-Json
    $results = @(Get-ChildItem (Join-Path $taskDir 'battles/slots/*/result.json') | ForEach-Object { Get-Content $_ -Raw | ConvertFrom-Json })
    $best = @($results | Where-Object { $_.slot.model -eq 'best' })
    $active = @(Get-ChildItem (Join-Path $taskDir 'battles/slots/*best*/live.json') | Where-Object { -not (Test-Path -LiteralPath (Join-Path $_.DirectoryName 'result.json')) } | ForEach-Object { (Get-Content $_ -Raw | ConvertFrom-Json).actions })
    # 只读观察本次进程产物；终态后退出，不创建后续定时任务。
    [PSCustomObject]@{ time = (Get-Date -Format 'HH:mm:ss'); phase = $phase.phase; bestCompleted = $best.Count; fixedSlots = $results.Count; activeActions = ($active | Measure-Object -Sum).Sum; bestOutcomes = @($best | Group-Object classification | ForEach-Object { $_.Name + ':' + $_.Count }) } | ConvertTo-Json -Compress
    if ($phase.phase -eq 'error') { exit 1 }
    if ($phase.phase -eq '等待最终报告' -or $phase.phase -eq 'complete') { exit 0 }
    Start-Sleep -Seconds 45
}
