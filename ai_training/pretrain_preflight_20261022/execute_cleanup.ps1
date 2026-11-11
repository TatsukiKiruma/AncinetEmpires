param([switch]$Execute)
$ErrorActionPreference = 'Stop'
$auditDirectory = $PSScriptRoot
$repositoryRoot = [System.IO.Path]::GetFullPath('C:\code\AncinetEmpires')
$manifestPath = Join-Path $auditDirectory 'CLEANUP_MANIFEST.json'
$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
$ledgerPath = Join-Path $auditDirectory 'cleanup-deletion-ledger.jsonl'
if (Test-Path -LiteralPath $ledgerPath) { throw '删除账本已存在，禁止重复执行覆盖；先审阅已有结果。' }

function Assert-SafeFile([string]$candidate) {
    $absolute = [System.IO.Path]::GetFullPath($candidate)
    if (-not $absolute.StartsWith($repositoryRoot + '\', [System.StringComparison]::OrdinalIgnoreCase)) { throw "仓库外路径：$absolute" }
    $allowed = @($manifest.allowedRoots | Where-Object { $absolute.StartsWith([System.IO.Path]::GetFullPath($_) + '\', [System.StringComparison]::OrdinalIgnoreCase) })
    if ($allowed.Count -eq 0) { throw "不在允许范围：$absolute" }
    $current = $absolute
    while ($current.Length -ge $repositoryRoot.Length) {
        $item = Get-Item -LiteralPath $current -Force
        if (($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) { throw "拒绝穿过重解析点：$current" }
        if ($current -eq $repositoryRoot) { break }
        $current = [System.IO.Path]::GetDirectoryName($current)
    }
    $file = Get-Item -LiteralPath $absolute -Force
    if ($file.PSIsContainer) { throw "只允许清单内单个文件：$absolute" }
    return $file
}

# 全部候选先通过边界、类型与摘要核验，再允许执行任何删除。
$dependencies = @{}
foreach ($candidate in $manifest.candidates) {
    if ($candidate.type -notin @('evaluation-rule-cache','python-bytecode')) { throw "未知清理类别：$($candidate.type)" }
    $item = Assert-SafeFile $candidate.path
    if ($item.Length -ne $candidate.bytes -or (Get-FileHash -LiteralPath $item.FullName -Algorithm SHA256).Hash.ToLowerInvariant() -ne $candidate.sha256) { throw "候选身份变化：$($item.FullName)" }
    if ($candidate.type -eq 'evaluation-rule-cache') {
        if (-not $candidate.validation.safeCandidate) { throw '缓存未通过来源与排重包含核验' }
        $dependencies[$candidate.validation.currentIndexPath] = $candidate.validation.currentIndexSha256
        foreach ($source in $candidate.validation.sourcePaths) { $dependencies[$source] = $candidate.validation.sourceSha256 }
    }
}
foreach ($dependency in $dependencies.GetEnumerator()) {
    if ((Get-FileHash -LiteralPath $dependency.Key -Algorithm SHA256).Hash.ToLowerInvariant() -ne $dependency.Value) { throw "保留依赖发生变化：$($dependency.Key)" }
}
$validation = @{ validatedAt = [DateTime]::UtcNow.ToString('o'); manifestSha256 = (Get-FileHash -LiteralPath $manifestPath -Algorithm SHA256).Hash.ToLowerInvariant(); files = $manifest.fileCount; logicalBytes = $manifest.logicalBytes; dependencies = $dependencies.Count; passed = $true; execute = [bool]$Execute }
$validation | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $auditDirectory 'cleanup-predelete-validation.json') -Encoding utf8
if (-not $Execute) { $validation | ConvertTo-Json; exit 0 }

$freeBefore = ([System.IO.DriveInfo]::new('C')).AvailableFreeSpace
$deletedBytes = [long]0
$deletedCount = 0
$failures = 0
foreach ($candidate in $manifest.candidates) {
    $row = @{ path = $candidate.path; bytes = $candidate.bytes; sha256 = $candidate.sha256; time = [DateTime]::UtcNow.ToString('o') }
    try {
        # 临删除再次检查，避免候选在预检后被替换成链接或不同内容。
        $item = Assert-SafeFile $candidate.path
        if ((Get-FileHash -LiteralPath $item.FullName -Algorithm SHA256).Hash.ToLowerInvariant() -ne $candidate.sha256) { throw '删除前摘要变化' }
        Remove-Item -LiteralPath $item.FullName -Force
        $row.result = 'deleted'
        $deletedBytes += $candidate.bytes
        $deletedCount++
    } catch {
        $row.result = 'retained_error'
        $row.error = $_.Exception.Message
        $failures++
    }
    $row | ConvertTo-Json -Compress | Add-Content -LiteralPath $ledgerPath -Encoding utf8
}
$freeAfter = ([System.IO.DriveInfo]::new('C')).AvailableFreeSpace
$result = @{ completedAt = [DateTime]::UtcNow.ToString('o'); manifestSha256 = $validation.manifestSha256; deletedFiles = $deletedCount; deletedLogicalBytes = $deletedBytes; retainedErrors = $failures; diskFreeBefore = $freeBefore; diskFreeAfter = $freeAfter; observedFreeSpaceIncrease = $freeAfter - $freeBefore; spaceInterpretation = '逻辑大小与C盘空闲变化分别报告；并发评测日志和系统写入使空闲差值不能精确归因到删除。没有递归删除目录。' }
$result | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $auditDirectory 'CLEANUP_RESULT.json') -Encoding utf8
$result | ConvertTo-Json
