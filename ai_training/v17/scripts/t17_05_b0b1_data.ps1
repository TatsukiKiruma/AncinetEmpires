# V17/T17-05: build the B0 / B1 same-input training sets (ASCII only, no backslash continuation).
#
# B0 and B1 must share EXACTLY the same input rows in the same order; only the policy
# label column differs. This script:
#   1. makes the B0 variant (frozen L1/H0 labels) and the B1 variant (B100-Q hard labels)
#      from the same labelled pool;
#   2. concatenates each with the SAME validation split and writes a trainer-ready file
#      plus one shared real-family split manifest.
#
set -e
$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
Set-Location $repo
$env:PYTHONIOENCODING = 'utf-8'
$py = 'C:\Users\SHIINA\AppData\Local\Programs\Python\Python312\python.exe'
$run = 'v17/out/v17_20260926_r2'
$data = "$run/data"
$exp = "$run/experiments"

New-Item -ItemType Directory -Force -Path "$exp/_data" | Out-Null

Write-Host '[t17_05] step 1/3: B0 variant (l1 labels)'
node --openssl-legacy-provider v12/tools/run-tool.mjs v17/tools/make_train_variant_v17.ts --dataset "$data/pool_B01_train.jsonl" --target l1 --out "$data/B0_train.jsonl" --report "$data/B0_train.report.json"

Write-Host '[t17_05] step 2/3: B1 variant (B100-Q teacher labels)'
node --openssl-legacy-provider v12/tools/run-tool.mjs v17/tools/make_train_variant_v17.ts --dataset "$data/pool_B01_train.jsonl" --target teacher --out "$data/B1_train.jsonl" --report "$data/B1_train.report.json"

Write-Host '[t17_05] step 3/3: trainer-ready trainval files + shared split manifest'
& $py v17/tools/make_v17_pool_trainer_input.py --train "$data/B0_train.jsonl" --val "$data/legacy_val_clean.jsonl" --val "$data/new_val/dataset_v17_newval.jsonl" --out "$exp/_data/B0_trainval.jsonl" --manifest-out "$exp/_data/B01_split_manifest.json" --provenance "$exp/_data/B0_provenance.json"
& $py v17/tools/make_v17_pool_trainer_input.py --train "$data/B1_train.jsonl" --val "$data/legacy_val_clean.jsonl" --val "$data/new_val/dataset_v17_newval.jsonl" --out "$exp/_data/B1_trainval.jsonl" --manifest-out "$exp/_data/B1_split_manifest.json" --provenance "$exp/_data/B1_provenance.json"

Write-Host '[t17_05] done'
