[CmdletBinding()]
param(
    [string]$SourceDir = "training_runs\episodes\sd_training_plan_20260705_heuristic-apk-like-balanced",
    [string]$OutRoot = "training_runs\feature_migrations\old_episode_v3",
    [int]$BatchEpisodes = 10,
    [int]$MaxSamplesPerEpisode = 300,
    [int]$ShardSamples = 5000,
    [ValidateSet("none", "heuristic", "fast-rollout")]
    [string]$RelabelMode = "fast-rollout",
    [int]$StopAfterBatches = 0,
    [switch]$FastRollout,
    [switch]$NoRelabel,
    [switch]$Status
)

$ErrorActionPreference = "Stop"
$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))

function Show-MigrationStatus {
    param([string]$Root)

    $resolvedRoot = if ([System.IO.Path]::IsPathRooted($Root)) {
        [System.IO.Path]::GetFullPath($Root)
    }
    else {
        [System.IO.Path]::GetFullPath((Join-Path $projectRoot $Root))
    }

    if (-not (Test-Path -LiteralPath $resolvedRoot -PathType Container)) {
        Write-Host "尚未发现迁移输出目录：$resolvedRoot"
        return
    }

    $statusFile = Get-ChildItem -LiteralPath $resolvedRoot -Filter "migration-status.json" -File -Recurse |
        Sort-Object -Property LastWriteTimeUtc -Descending |
        Select-Object -First 1
    if ($null -eq $statusFile) {
        Write-Host "尚未发现 migration-status.json：$resolvedRoot"
        return
    }

    $migrationStatus = Get-Content -LiteralPath $statusFile.FullName -Raw -Encoding UTF8 |
        ConvertFrom-Json
    Write-Host "迁移状态：$($migrationStatus.state)"
    Write-Host "批次进度：$($migrationStatus.completedBatches)/$($migrationStatus.totalBatches)"
    if ($migrationStatus.currentBatch) {
        Write-Host "当前批次：$($migrationStatus.currentBatch)"
    }
    Write-Host "最后更新：$($migrationStatus.updatedAt)"
    Write-Host "状态文件：$($statusFile.FullName)"
    if ($migrationStatus.finalManifest) {
        Write-Host "最终 manifest：$($migrationStatus.finalManifest)"
    }
    if ($migrationStatus.message) {
        Write-Host "说明：$($migrationStatus.message)"
    }
}

if ($BatchEpisodes -lt 1) {
    throw "-BatchEpisodes 必须是正整数"
}
if ($MaxSamplesPerEpisode -lt 1) {
    throw "-MaxSamplesPerEpisode 必须是正整数"
}
if ($ShardSamples -lt 1) {
    throw "-ShardSamples 必须是正整数"
}
if ($StopAfterBatches -lt 0) {
    throw "-StopAfterBatches 不能小于 0"
}
if ($FastRollout -and $NoRelabel) {
    throw "-FastRollout 与 -NoRelabel 不能同时使用"
}

if ($Status) {
    Show-MigrationStatus -Root $OutRoot
    exit 0
}

$migrationArgs = @(
    "--source-dir", $SourceDir,
    "--out-root", $OutRoot,
    "--batch-episodes", [string]$BatchEpisodes,
    "--max-samples-per-episode", [string]$MaxSamplesPerEpisode,
    "--shard-samples", [string]$ShardSamples,
    "--relabel-mode", $RelabelMode
)
if ($FastRollout) {
    $migrationArgs += "--fast-rollout"
}
if ($NoRelabel) {
    $migrationArgs += "--no-relabel"
}
if ($StopAfterBatches -gt 0) {
    $migrationArgs += @("--stop-after-batches", [string]$StopAfterBatches)
}

Write-Host "开始旧数据迁移。可随时按 Ctrl+C 停止；之后使用完全相同的参数重新运行即可续接。"
Write-Host "每个 checkpoint 包含 $BatchEpisodes 个 episode。完成的 checkpoint 会先校验，再自动跳过。"

Push-Location $projectRoot
$migrationExitCode = 1
try {
    & npm.cmd run migrate:skirmish:old-data -- @migrationArgs
    $migrationExitCode = $LASTEXITCODE
}
finally {
    Pop-Location
}

if ($migrationExitCode -ne 0) {
    Write-Error "迁移进程退出，代码：$migrationExitCode。修复问题后以相同参数重跑即可从完整 checkpoint 继续。"
}

Write-Host "迁移命令已结束。可执行以下命令查看状态："
Write-Host "  .\tools\migrate_old_training_data.ps1 -OutRoot `"$OutRoot`" -Status"
exit $migrationExitCode
