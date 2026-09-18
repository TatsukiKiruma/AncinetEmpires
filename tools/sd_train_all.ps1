param(
  [string]$Preset = "heuristic-apk-like-balanced",
  [int]$Workers = 5,
  [int]$FeatureWorkers = 0,
  [int]$BatchEpisodes = 10,
  [int]$StopAfterFeatureBatches = 0,
  [int]$ProgressTurnInterval = 5,
  [string[]]$Plans = @(),
  [int]$MaxSamplesPerEpisode = 800,
  [int]$ShardSamples = 50000,
  [double]$ValidationRatio = 0.1,
  [string[]]$RelabelPolicies = @("apk-like"),
  [switch]$PrepareOnly,
  [switch]$SkipModelTraining
)

$ErrorActionPreference = "Stop"
if ($FeatureWorkers -eq 0) { $FeatureWorkers = $Workers }
if ($FeatureWorkers -lt 1 -or $FeatureWorkers -gt 64 -or $BatchEpisodes -lt 1 -or $StopAfterFeatureBatches -lt 0) {
  throw "FeatureWorkers 必须为 1 到 64，BatchEpisodes 必须为正数，StopAfterFeatureBatches 不能为负数。"
}

$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $RepoRoot
$NpmCommand = "npm.cmd"
if (-not (Get-Command $NpmCommand -ErrorAction SilentlyContinue)) {
  $NpmCommand = "npm"
}

if ($Preset -like "*random*") {
  throw "SD 正式训练不允许 random preset：$Preset"
}

$RunName = "sd_training_plan_20260705_$Preset"
$EpisodeDir = "training_runs\episodes\$RunName"
$ArtifactRoot = "training_runs\feature_datasets\$RunName"
$JobManifestRoot = "training_runs\job_manifests\$RunName"
$ModelOut = "training_runs\models\sd-bc-f4096-c64-v3-$RunName.json"

$DefaultPlans = @(
  "sd-normal",
  "sd-low-gold",
  "sd-high-gold",
  "sd-low-unit-limit",
  "sd-high-unit-limit",
  "sd-3p-normal-extra",
  "sd-3p-high-gold-extra",
  "sd-3p-low-unit-extra",
  "sd-4p-normal-extra",
  "sd-4p-high-gold-extra",
  "sd-small-advantage-endgame",
  "sd-medium-advantage-endgame",
  "sd-large-advantage-endgame",
  "sd-small-disadvantage-endgame",
  "sd-medium-disadvantage-endgame",
  "sd-equal-preset-units",
  "sd-high-tier-specialist",
  "sd-skill-specialist",
  "sd-building-finish"
)

if ($Plans.Count -eq 0) {
  $Plans = $DefaultPlans
}

function Invoke-CheckedCommand {
  param(
    [string]$Label,
    [string[]]$ArgList
  )

  Write-Host ""
  Write-Host ">>> $Label"
  & $NpmCommand @ArgList
  if ($LASTEXITCODE -ne 0) {
    throw "$Label 失败，退出码：$LASTEXITCODE"
  }
}

$ManifestArgs = @(
  "run", "sd:training-manifest", "--",
  "--plan", "training_configs\sd_training_plan_20260705.json",
  "--out-root", $JobManifestRoot,
  "--json"
)
foreach ($Plan in $Plans) {
  $ManifestArgs += @("--plan-id", $Plan)
}
Invoke-CheckedCommand "生成不可变 SD job manifest" $ManifestArgs

if ($PrepareOnly) {
  Write-Host ""
  Write-Host "训练计划和不可变 job manifest 已准备完成。"
  exit 0
}

$EpisodeFiles = @()
foreach ($Plan in $Plans) {
  $Episode = "$EpisodeDir\$Plan-episodes.jsonl"
  $EpisodeFiles += $Episode

  Invoke-CheckedCommand "生成 episode：$Plan" @(
      "run", "sd:training-plan", "--",
      "--plan-id", $Plan,
      "--run",
      "--preset", $Preset,
      "--out-dir", $EpisodeDir,
      "--workers", "$Workers",
      "--progress-turn-interval", "$ProgressTurnInterval",
      "--json"
  )
}

# 每次调用独立记录结果；完成后再次运行也可准确定位原 manifest。
$ExportResultFile = Join-Path $ArtifactRoot ("export-result-" + [guid]::NewGuid().ToString("N") + ".json")

$ExportArgs = @(
  "run", "export:skirmish:checkpoint-features", "--",
  "--out-root", $ArtifactRoot,
  "--result-file", $ExportResultFile,
  "--workers", "$FeatureWorkers",
  "--batch-episodes", "$BatchEpisodes",
  "--dataset-version", "$RunName-v3",
  "--plan", "training_configs\sd_training_plan_20260705.json",
  "--feature-dim", "4096",
  "--feature-extractor", "hashed-action-v3",
  "--max-candidates", "64",
  "--hard-negative-ratio", "0.5",
  "--timeout-prefix-turns", "80",
  "--timeout-tail-turns", "20",
  "--max-samples-per-episode", "$MaxSamplesPerEpisode",
  "--action-type-limit", "move=400000",
  "--action-type-limit", "wait=200000",
  "--shard-samples", "$ShardSamples",
  "--validation-ratio", "$ValidationRatio",
  "--split-seed", "20260730",
  "--relabel-mode", "fast-rollout",
  "--relabel-policy", "random",
  "--json"
)
foreach ($Episode in $EpisodeFiles) {
  $ExportArgs += @("--input", $Episode)
}
foreach ($Policy in $RelabelPolicies) {
  if ($Policy) {
    $ExportArgs += @("--relabel-policy", $Policy)
  }
}
if ($StopAfterFeatureBatches -gt 0) {
  $ExportArgs += @("--stop-after-batches", "$StopAfterFeatureBatches")
}
Invoke-CheckedCommand "并行导出 feature checkpoint（支持断点续跑）" $ExportArgs

$ExportResult = Get-Content -LiteralPath $ExportResultFile -Raw | ConvertFrom-Json
if ($ExportResult.paused) {
  Write-Host "特征导出已暂停。重新执行相同命令即可继续，状态文件：$($ExportResult.statusFile)"
  exit 0
}
$DatasetManifest = $ExportResult.finalManifest
if (-not $DatasetManifest) { throw "导出未返回最终 manifest。" }

Invoke-CheckedCommand "验证 feature 数据集" @(
  "run", "validate:skirmish:features", "--",
  "--manifest", $DatasetManifest
)

if ($SkipModelTraining) {
  Write-Host ""
  Write-Host "已跳过 BC 模型训练。数据集 manifest：$DatasetManifest"
  exit 0
}

$TrainArgs = @(
  "run", "train:skirmish:bc", "--",
  "--dataset-manifest", $DatasetManifest,
  "--feature-dim", "4096",
  "--feature-extractor", "hashed-action-v3",
  "--max-candidates", "64",
  "--out", $ModelOut,
  "--json"
)

Invoke-CheckedCommand "训练 BC 模型" $TrainArgs

Write-Host ""
Write-Host "训练完成。模型：$ModelOut"
Write-Host "数据集 manifest：$DatasetManifest"
