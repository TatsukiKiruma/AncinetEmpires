param(
  [string]$Preset = "heuristic-apk-like-balanced",
  [int]$Workers = 5,
  [int]$ProgressTurnInterval = 5,
  [string[]]$Plans = @(),
  [switch]$PrepareOnly,
  [switch]$SkipModelTraining
)

$ErrorActionPreference = "Stop"

$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $RepoRoot
$NpmCommand = "npm.cmd"
if (-not (Get-Command $NpmCommand -ErrorAction SilentlyContinue)) {
  $NpmCommand = "npm"
}

if ($Preset -like "*random*") {
  throw "SD formal training does not allow random preset: $Preset"
}

$RunName = "sd_training_plan_20260705_$Preset"
$EpisodeDir = "training_runs\episodes\$RunName"
$DatasetDir = "training_runs\datasets\$RunName"
$FeatureDir = "training_runs\features\$RunName"
$ModelOut = "training_runs\models\sd-bc-f4096-c64-$RunName.json"

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
    throw "$Label failed with exit code $LASTEXITCODE"
  }
}

Invoke-CheckedCommand "Prepare SD training plan" @("run", "sd:training-plan", "--", "--json")

if ($PrepareOnly) {
  Write-Host ""
  Write-Host "Training plan is ready."
  exit 0
}

foreach ($Plan in $Plans) {
  $Episode = "$EpisodeDir\$Plan-episodes.jsonl"
  $Dataset = "$DatasetDir\$Plan-dataset.jsonl"
  $Feature = "$FeatureDir\$Plan-f4096-c64.jsonl"

  Invoke-CheckedCommand "Generate episode: $Plan" @(
      "run", "sd:training-plan", "--",
      "--plan-id", $Plan,
      "--run",
      "--preset", $Preset,
      "--out-dir", $EpisodeDir,
      "--workers", "$Workers",
      "--progress-turn-interval", "$ProgressTurnInterval",
      "--json"
  )

  Invoke-CheckedCommand "Export dataset: $Plan" @(
      "run", "export:skirmish:dataset", "--",
      "--input", $Episode,
      "--out", $Dataset,
      "--sd-training-plan", "training_configs\sd_training_plan_20260705.json",
      "--json"
  )

  Invoke-CheckedCommand "Export feature: $Plan" @(
      "run", "export:skirmish:features", "--",
      "--input", $Dataset,
      "--out", $Feature,
      "--feature-dim", "4096",
      "--feature-extractor", "hashed-action-v2",
      "--max-candidates", "64",
      "--json"
  )
}

if ($SkipModelTraining) {
  Write-Host ""
  Write-Host "Skipped BC model training. Feature dir: $FeatureDir"
  exit 0
}

$TrainArgs = @(
  "run", "train:skirmish:bc", "--",
  "--train", "$FeatureDir\sd-normal-f4096-c64.jsonl"
)

foreach ($Plan in $Plans) {
  if ($Plan -eq "sd-normal") {
    continue
  }
  $TrainArgs += @("--extra-train", "$FeatureDir\$Plan-f4096-c64.jsonl")
}

$TrainArgs += @(
  "--feature-dim", "4096",
  "--feature-extractor", "hashed-action-v2",
  "--max-candidates", "64",
  "--out", $ModelOut,
  "--json"
)

Invoke-CheckedCommand "Train BC model" $TrainArgs

Write-Host ""
Write-Host "Training complete. Model: $ModelOut"
