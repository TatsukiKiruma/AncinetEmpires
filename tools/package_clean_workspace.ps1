param(
    [string]$Source = 'deliverables/clean_workspace',
    [string]$Output = 'deliverables/AncientEmpires-clean-environment.zip',
    [switch]$ReplaceExisting
)
$ErrorActionPreference = 'Stop'
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$sourcePath = [IO.Path]::GetFullPath((Join-Path $root $Source))
$outputPath = [IO.Path]::GetFullPath((Join-Path $root $Output))
if (-not $sourcePath.StartsWith($root + [IO.Path]::DirectorySeparatorChar) -or
    -not $outputPath.StartsWith($root + [IO.Path]::DirectorySeparatorChar)) {
    throw '交付源和压缩包必须位于项目目录内。'
}
if ((Test-Path -LiteralPath $outputPath) -and -not $ReplaceExisting) { throw "压缩包已存在；使用 -ReplaceExisting 备份后替换：$outputPath" }
$manifest = Get-Content -LiteralPath (Join-Path $sourcePath 'DELIVERY_MANIFEST.json') -Raw | ConvertFrom-Json

# 只打包白名单，并重新核对内容；安装产生的依赖、缓存和编译产物不进入交付。
$paths = @()
foreach ($entry in $manifest.files) {
    $file = [IO.Path]::GetFullPath((Join-Path $sourcePath $entry.path))
    if (-not $file.StartsWith($sourcePath + [IO.Path]::DirectorySeparatorChar)) { throw '交付清单含越界路径。' }
    if ((Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant() -ne $entry.sha256) {
        throw "交付文件哈希不匹配：$($entry.path)"
    }
    $paths += [pscustomobject]@{Source=$file; Entry=$entry.path}
}
$paths += [pscustomobject]@{Source=(Join-Path $sourcePath 'DELIVERY_MANIFEST.json'); Entry='DELIVERY_MANIFEST.json'}
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$temporaryPath = $outputPath + '.new-' + [guid]::NewGuid().ToString('N')
$archive = [IO.Compression.ZipFile]::Open($temporaryPath, [IO.Compression.ZipArchiveMode]::Create)
try {
    foreach ($file in $paths) {
        $null = [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, $file.Source, $file.Entry, [IO.Compression.CompressionLevel]::Optimal)
    }
} finally {
    $archive.Dispose()
}
# 完整核对压缩包内字节后才替换交付文件，旧包另存备份。
$checkArchive = [IO.Compression.ZipFile]::OpenRead($temporaryPath)
try {
    if ($checkArchive.Entries.Count -ne $paths.Count) { throw '压缩包条目数量不匹配。' }
    foreach ($entry in $manifest.files) {
        $packedEntry = $checkArchive.GetEntry($entry.path)
        if ($null -eq $packedEntry) { throw "压缩包缺少文件：$($entry.path)" }
        $stream = $packedEntry.Open()
        $algorithm = [Security.Cryptography.SHA256]::Create()
        try {
            $digest = [BitConverter]::ToString($algorithm.ComputeHash($stream)).Replace('-', '').ToLowerInvariant()
            if ($digest -ne $entry.sha256) { throw "压缩包文件哈希不匹配：$($entry.path)" }
        } finally {
            $algorithm.Dispose()
            $stream.Dispose()
        }
    }
} finally { $checkArchive.Dispose() }
if (Test-Path -LiteralPath $outputPath) {
    $backupPath = $outputPath + '.previous-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + [guid]::NewGuid().ToString('N').Substring(0, 8)
    Move-Item -LiteralPath $outputPath -Destination $backupPath
    Write-Output "旧包已备份：$backupPath"
}
Move-Item -LiteralPath $temporaryPath -Destination $outputPath
Write-Output "已打包 $($paths.Count) 个文件：$outputPath"
