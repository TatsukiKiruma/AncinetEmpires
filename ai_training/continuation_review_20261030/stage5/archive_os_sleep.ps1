$ErrorActionPreference = 'Stop'
$dataRoot = 'D:\AncientEmpiresData\continuation_stage5_20261104_v1'
$codeRoot = 'C:\code\AncinetEmpires\ai_training\continuation_review_20261030\stage5'
$developmentRoot = Join-Path $dataRoot 'development-v2'
$archiveRoot = Join-Path $dataRoot 'interrupted-os-sleep-archive-20261105'
if (Test-Path -LiteralPath $archiveRoot) { throw '归档目录已存在，禁止重复移动' }
$live = Get-CimInstance Win32_Process | Where-Object { $_.Name -in @('node.exe','python.exe') -and ($_.CommandLine -like '*stage5*' -or $_.CommandLine -like '*stage4_v7*infer.py*') }
if ($live) { throw '仍有运行进程，禁止归档' }
$protected = @()
$naturalCount = 0
foreach ($receipt in Get-ChildItem -LiteralPath $developmentRoot -Filter 'C1-*.receipt.json') {
    $match = $receipt.Name.Substring(3).Replace('.receipt.json','')
    if ($match -in @('p4-17-s3','p4-18-s3')) { continue }
    $gameRoot = Join-Path $developmentRoot "C1\$match"
    $summary = Get-Content -LiteralPath (Join-Path $gameRoot 'SUMMARY.json') -Raw | ConvertFrom-Json
    if (-not $summary.games[0].natural) { throw '保留对局不是自然完赛' }
    $naturalCount++
    $protected += Get-ChildItem -LiteralPath $gameRoot -File -Recurse
    $protected += $receipt
}
if ($naturalCount -ne 48) { throw '自然完赛不是48局' }
foreach ($screen in @('screen-C1','screen-C2','screen-C3')) { $protected += Get-ChildItem -LiteralPath (Join-Path $developmentRoot $screen) -File -Recurse }
$protected += Get-Item -LiteralPath (Join-Path $codeRoot 'DEV18_SUMMARY.json')
$before = @{}
foreach ($file in $protected) { $before[$file.FullName] = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash }
$targets = @()
foreach ($match in @('p4-17-s3','p4-18-s3')) {
    $targets += @{ Source=(Join-Path $developmentRoot "C1\$match"); Relative="development-v2\C1\$match" }
    foreach ($suffix in @('receipt.json','subset.json')) { $targets += @{ Source=(Join-Path $developmentRoot "C1-$match.$suffix"); Relative="development-v2\C1-$match.$suffix" } }
}
foreach ($name in @('STOP','DEV54_SUMMARY.json','GATE_DECISION.json','DEVELOPMENT_GATE_REPORT.json','STAGE5_SEALED_ACCEPTANCE.json','FINAL_PAIRED_COMPARISON.json','STAGE5_CLOSEOUT.json','RUN_CLOSED.json','STAGE5_REPORT.md','REPORT.md','EVIDENCE_MANIFEST.json')) {
    $targets += @{ Source=(Join-Path $codeRoot $name); Relative="stage5\$name" }
}
New-Item -ItemType Directory -Path $archiveRoot | Out-Null
$moved = @()
foreach ($target in $targets) {
    if (-not (Test-Path -LiteralPath $target.Source)) { continue }
    $source = (Resolve-Path -LiteralPath $target.Source).Path
    if ($source -ne $target.Source -or (-not $source.StartsWith($developmentRoot+'\') -and -not $source.StartsWith($codeRoot+'\'))) { throw '源路径越界' }
    $destination = [IO.Path]::GetFullPath((Join-Path $archiveRoot $target.Relative))
    if (-not $destination.StartsWith($archiveRoot+'\')) { throw '归档目标越界' }
    $files = if ((Get-Item -LiteralPath $source).PSIsContainer) { @(Get-ChildItem -LiteralPath $source -File -Recurse) } else { @(Get-Item -LiteralPath $source) }
    $hashes = @($files | ForEach-Object { @{ Path=$_.FullName; Sha256=(Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash; Length=$_.Length } })
    New-Item -ItemType Directory -Path (Split-Path -Parent $destination) -Force | Out-Null
    Move-Item -LiteralPath $source -Destination $destination
    foreach ($file in $hashes) {
        $newFile = if ($file.Path -eq $source) { $destination } else { $destination + $file.Path.Substring($source.Length) }
        if ((Get-FileHash -LiteralPath $newFile -Algorithm SHA256).Hash -ne $file.Sha256) { throw '归档哈希不符' }
    }
    $moved += @{ Source=$source; Destination=$destination; Files=$hashes }
}
foreach ($file in $before.Keys) { if ((Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash -ne $before[$file]) { throw '受保护证据变化' } }
@{ Moved=$moved; ProtectedHashes=$before; NaturalGames=48; HostSleepCause='用户确认Windows系统休眠/睡眠挂起'; CheckedAt=(Get-Date -Format o) } | ConvertTo-Json -Depth 9 | Set-Content -LiteralPath (Join-Path $codeRoot 'OS_SLEEP_ARCHIVE_RECEIPT.json') -Encoding utf8
Write-Output "归档完成：$($moved.Count)项，48局及三组预筛证据哈希不变"
