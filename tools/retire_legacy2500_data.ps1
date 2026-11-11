param([switch]$Apply)

$ErrorActionPreference = 'Stop'
$workspaceRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$archiveRoot = Join-Path $workspaceRoot 'ai_training\training_runs\server_archive_20260913'
$rawRoot = Join-Path $workspaceRoot 'ai_training\training_runs\episodes\sd_training_plan_20260705_heuristic-apk-like-balanced'
$recoveryRoot = Join-Path $workspaceRoot 'ai_training\legacy2500_recovery_20261014_090431'
$probeRoot = Join-Path $workspaceRoot 'ai_training\legacy1395_probe_20261014_093632'
$recordRoot = Join-Path $workspaceRoot ('captures\legacy2500-deletion-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
$compact = Get-Content -LiteralPath (Join-Path $archiveRoot 'compact_manifest.json') -Raw | ConvertFrom-Json
$inventory = Get-Content -LiteralPath (Join-Path $recoveryRoot 'asset_inventory.json') -Raw | ConvertFrom-Json
$targets = @()
foreach ($archive in $compact.archives) {
    $targets += [pscustomobject]@{ path = Join-Path $archiveRoot $archive.path; expected_sha256 = $archive.sha256; kind = '旧2500局哈希特征归档' }
}
foreach ($asset in $inventory.assets) {
    if ($asset.kind -eq 'raw_episode' -and $asset.exists) {
        $targets += [pscustomobject]@{ path = Join-Path $rawRoot $asset.name; expected_sha256 = $asset.sha256; kind = '旧2500局残存原始轨迹' }
    }
}
foreach ($name in @('train.jsonl', 'validation.jsonl', 'state_index.jsonl')) {
    $targets += [pscustomobject]@{ path = Join-Path $recoveryRoot ('package\' + $name); expected_sha256 = $null; kind = '旧2500局恢复候选数据' }
}
foreach ($name in @('train.jsonl', 'validation.jsonl')) {
    $targets += [pscustomobject]@{ path = Join-Path $probeRoot ('package\' + $name); expected_sha256 = $null; kind = '旧1395局抽验派生数据' }
}
if ($targets.Count -ne 19) { throw '旧数据文件数量与已审阅范围不一致' }

# 仅处理明确列出的普通文件；不递归删除目录，不穿越联接或符号链接。
$rows = @()
foreach ($target in $targets) {
    $absolutePath = [IO.Path]::GetFullPath($target.path)
    if (-not $absolutePath.StartsWith($workspaceRoot + '\', [StringComparison]::OrdinalIgnoreCase)) { throw "路径越界：$absolutePath" }
    if (-not $absolutePath.StartsWith((Join-Path $workspaceRoot 'ai_training') + '\', [StringComparison]::OrdinalIgnoreCase)) { throw "不属于旧训练工作区：$absolutePath" }
    $cursor = Get-Item -LiteralPath $absolutePath -Force
    if ($cursor.PSIsContainer) { throw "拒绝删除目录：$absolutePath" }
    $file = $cursor
    while ($null -ne $cursor -and $cursor.FullName.Length -ge $workspaceRoot.Length) {
        if (($cursor.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw "拒绝穿越联接或符号链接：$($cursor.FullName)" }
        $cursor = if ($cursor.PSIsContainer) { $cursor.Parent } else { $cursor.Directory }
    }
    $digest = (Get-FileHash -LiteralPath $absolutePath -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($target.expected_sha256 -and $digest -ne $target.expected_sha256) { throw "历史文件摘要变化，尚未删除：$absolutePath" }
    $rows += [pscustomobject]@{ path = $absolutePath; bytes = $file.Length; sha256 = $digest; modified_utc = $file.LastWriteTimeUtc.ToString('o'); kind = $target.kind }
}
New-Item -ItemType Directory -Path $recordRoot | Out-Null
$beforeFree = (Get-PSDrive C).Free
$record = [ordered]@{ requested_action = '用户明确要求删除旧2500局数据'; created_at = (Get-Date).ToString('o'); apply = [bool]$Apply; status = '已核对，尚未删除'; files = $rows; logical_bytes = ($rows | Measure-Object bytes -Sum).Sum; pc_free_before = $beforeFree; deleted = @(); retained = @('当前手机3000局及所有续跑数据', '历史模型和训练恢复状态', '旧数据审计报告、来源清单、哈希与源码'); recursive_delete = $false }
$recordPath = Join-Path $recordRoot 'deletion-record.json'
$record | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $recordPath -Encoding utf8
if ($Apply) {
    foreach ($row in $rows) {
        $file = Get-Item -LiteralPath $row.path -Force
        if ($file.Length -ne $row.bytes -or $file.LastWriteTimeUtc.ToString('o') -ne $row.modified_utc) { throw "文件在核对后发生变化：$($row.path)" }
        Remove-Item -LiteralPath $row.path -Force
        if (Test-Path -LiteralPath $row.path) { throw "删除后文件仍存在：$($row.path)" }
        $record.deleted += $row.path
        $record | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $recordPath -Encoding utf8
    }
    $record.status = '已按用户要求删除旧数据，逐文件确认不存在'
    $record.pc_free_after = (Get-PSDrive C).Free
    $record.pc_free_change = $record.pc_free_after - $beforeFree
    $record.completed_at = (Get-Date).ToString('o')
    $record | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $recordPath -Encoding utf8
    # 单独补充失效说明，避免重写历史清单和伪装原有证据。
    foreach ($directory in @($archiveRoot, $rawRoot, (Join-Path $recoveryRoot 'package'), (Join-Path $probeRoot 'package'))) {
        "旧2500局相关数据已于$($record.completed_at)按用户明确要求删除。保留的manifest、报告和哈希仅为历史证据，不能继续作为数据可用性证明。逐文件删除记录：$recordPath。手机当前3000局及续跑记录保留。" | Set-Content -LiteralPath (Join-Path $directory '数据已删除.txt') -Encoding utf8
    }
}
[pscustomobject]@{ record = $recordPath; files = $rows.Count; logical_bytes = $record.logical_bytes; deleted_files = $record.deleted.Count; status = $record.status } | ConvertTo-Json
