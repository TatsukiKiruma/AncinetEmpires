# 本批只在采集和核验全部退出后迁移；先复制和核SHA，再移除C盘数据副本。
$ErrorActionPreference = 'Stop'
$source = [IO.Path]::GetFullPath('C:\code\AncinetEmpires\ai_training\hard_gap_pc32_320_20261029_v1')
$destinationRoot = [IO.Path]::GetFullPath('D:\AncientEmpiresData\collection_20261029_pc32')
$destination = Join-Path $destinationRoot 'hard_gap_pc32_320_20261029_v1'
if ($source -ne 'C:\code\AncinetEmpires\ai_training\hard_gap_pc32_320_20261029_v1' -or !$destinationRoot.StartsWith('D:\AncientEmpiresData\')) { throw '迁移边界不符' }
if (Test-Path -LiteralPath $destinationRoot) { throw '目标已存在，拒绝覆盖' }
if ((Get-Item -LiteralPath $source).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw '来源不能是链接' }
if (@(Get-ChildItem -LiteralPath $source -Recurse -Force | Where-Object { $_.Attributes -band [IO.FileAttributes]::ReparsePoint }).Count) { throw '来源包含链接，拒绝递归迁移' }
$closed = Get-Content -LiteralPath (Join-Path $source 'CLOSED.json') -Raw | ConvertFrom-Json
$launcher = Get-Content -LiteralPath (Join-Path $source 'LAUNCHER_EXIT.json') -Raw | ConvertFrom-Json
if (!$closed.allStartedCollectorProcessesExited -or $launcher.exitCode -ne 0) { throw '采集或宿主尚未正常退出' }
if ((Test-Path -LiteralPath (Join-Path $source 'DRIVER.lock')) -or @(Get-ChildItem -LiteralPath $source -Recurse -Filter RUNNING.lock).Count) { throw '运行锁尚未释放' }
$running = @(Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'node.exe' -and $_.CommandLine -match 'hard_gap_pc32_320_20261029_v1' })
if ($running.Count) { throw '仍有本批进程，拒绝移动' }
$index = [IO.File]::ReadAllBytes('C:\code\AncinetEmpires\.git\index')
if ([Text.Encoding]::UTF8.GetString($index).Contains('hard_gap_pc32_320_20261029_v1')) { throw 'Git索引出现本批目录，先核实是否被暂存' }
$files = @(Get-ChildItem -LiteralPath $source -Recurse -File -Force)
$total = ($files | Measure-Object Length -Sum).Sum
if ((Get-PSDrive D).Free -lt $total + 1GB) { throw 'D盘空间不足' }
New-Item -ItemType Directory -Path $destination -Force | Out-Null
$records = @()
foreach ($file in $files) {
    $relative = [IO.Path]::GetRelativePath($source, $file.FullName)
    $target = [IO.Path]::GetFullPath((Join-Path $destination $relative))
    if (!$file.FullName.StartsWith($source+'\') -or !$target.StartsWith($destination+'\')) { throw '文件超出迁移边界' }
    New-Item -ItemType Directory -Path ([IO.Path]::GetDirectoryName($target)) -Force | Out-Null
    Copy-Item -LiteralPath $file.FullName -Destination $target
    $sha = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash
    if ((Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash -ne $sha) { throw "复制摘要不符：$relative" }
    $keepSource = $file.Extension -in @('.ts','.mjs','.ps1')
    $records += [pscustomobject]@{relativePath=$relative;bytes=$file.Length;sha256=$sha;keepSourceCode=$keepSource}
}
$manifest = @{source=$source;destination=$destination;copiedFiles=$records.Count;bytes=$total;verified=$true;state='copied_and_verified';created=[DateTimeOffset]::Now.ToString('o');files=$records;historicalPathsPreserved=$true}
$manifest | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $destinationRoot 'MIGRATION.json') -Encoding utf8
# 删除前再验证来源没有变化，目标副本仍完整；不操作其他目录。
foreach ($record in $records) {
    $old = [IO.Path]::GetFullPath((Join-Path $source $record.relativePath))
    $new = [IO.Path]::GetFullPath((Join-Path $destination $record.relativePath))
    if (!$old.StartsWith($source+'\') -or !$new.StartsWith($destination+'\')) { throw '删除边界不符' }
    if ((Get-FileHash -LiteralPath $old).Hash -ne $record.sha256 -or (Get-FileHash -LiteralPath $new).Hash -ne $record.sha256) { throw '迁移中发生变化，保留来源' }
}
foreach ($record in $records | Where-Object { !$_.keepSourceCode }) { Remove-Item -LiteralPath (Join-Path $source $record.relativePath) }
Get-ChildItem -LiteralPath $source -Directory -Recurse | Sort-Object { $_.FullName.Length } -Descending | ForEach-Object {
    if (!$_.FullName.StartsWith($source+'\')) { throw '目录边界不符' }
    if (@(Get-ChildItem -LiteralPath $_.FullName -Force).Count -eq 0) { Remove-Item -LiteralPath $_.FullName }
}
$manifest.state='moved_verified_source_code_retained';$manifest.finished=[DateTimeOffset]::Now.ToString('o')
$manifest | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $destinationRoot 'MIGRATION.json') -Encoding utf8
$pointer = @{moved=$true;source=$source;dataDirectory=$destination;manifest=(Join-Path $destinationRoot 'MIGRATION.json');resumeAuthorized=$false;noDirectoryJunction=$true;note='原始账本内历史路径保持原文，读取时将source前缀映射到dataDirectory；旧驱动不可直接恢复。'}
$pointer | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $source 'HANDOFF.json') -Encoding utf8
$pointer | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $source 'STORAGE_LOCATION.json') -Encoding utf8
@"
# 本批采集数据已迁移

完整数据、冻结输入、账本、日志和原始源码快照位于：

$destination

逐文件SHA256核验清单：$destinationRoot\MIGRATION.json

C盘仅保留源码和本迁移指引，不建立目录链接。旧驱动不能直接恢复；原始账本中的历史C盘路径未篡改，读取时按STORAGE_LOCATION.json映射到D盘。DRAIN原件随数据保留，不启动后续批次。
"@ | Set-Content -LiteralPath (Join-Path $source 'README.md') -Encoding utf8
[pscustomobject]@{destination=$destination;files=$records.Count;bytes=$total;removedDataFiles=@($records|Where-Object {!$_.keepSourceCode}).Count;retainedSourceFiles=@($records|Where-Object {$_.keepSourceCode}).Count;verified=$true} | ConvertTo-Json
