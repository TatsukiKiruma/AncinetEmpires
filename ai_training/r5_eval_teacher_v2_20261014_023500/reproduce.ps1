# ==============================================================================
# AncientEmpires T07-T12 Stage Reproduce Verification Script
# ==============================================================================

$ErrorActionPreference = "Stop"
$STAGE_DIR = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "==================================================================" -ForegroundColor Cyan
Write-Host " [REPRODUCE] Starting R5 Full Stage Automated Regression" -ForegroundColor Cyan
Write-Host " Workspace: $STAGE_DIR" -ForegroundColor Cyan
Write-Host " Rules Revision: apk-4.2.5.1-rules-20261013-r4" -ForegroundColor Cyan
Write-Host "==================================================================" -ForegroundColor Cyan

# 1. 验证冻结独立环境规则回归测试
Write-Host ""
Write-Host ">>> [1/6] Running frozen environment rule tests (285 unit tests)..." -ForegroundColor Yellow
Push-Location "$STAGE_DIR\env"
npm test
if ($LASTEXITCODE -ne 0) { throw "env npm test failed!" }
Pop-Location

# 2. 运行严格裁判与重放一致性测试
Write-Host ""
Write-Host ">>> [2/6] Running match runner and 1,157-step deterministic replay tests..." -ForegroundColor Yellow
Push-Location "$STAGE_DIR"
npx vitest run research/match_runner.test.ts
if ($LASTEXITCODE -ne 0) { throw "match_runner.test.ts failed!" }

# 3. 运行评测协议与分层统计测试
Write-Host ""
Write-Host ">>> [3/6] Running evaluation protocol and stratified Bootstrap tests..." -ForegroundColor Yellow
npx vitest run research/evaluate.test.ts
if ($LASTEXITCODE -ne 0) { throw "evaluate.test.ts failed!" }

# 4. 运行特征表示与 Golden 样本重建测试
Write-Host ""
Write-Host ">>> [4/6] Running feature schema and Golden sample reconstruction tests..." -ForegroundColor Yellow
npx vitest run research/features.test.ts
if ($LASTEXITCODE -ne 0) { throw "features.test.ts failed!" }

# 5. 运行搜索教师正确性与边界回归测试
Write-Host ""
Write-Host ">>> [5/6] Running search teacher correctness and boundary tests..." -ForegroundColor Yellow
npx vitest run research/search_teacher_v1.test.ts
if ($LASTEXITCODE -ne 0) { throw "search_teacher_v1.test.ts failed!" }
Pop-Location

# 6. 受保护主项目核心文件 0 变动校验
Write-Host ""
Write-Host ">>> [6/6] Verifying integrity of 14 protected root files..." -ForegroundColor Yellow
python "$STAGE_DIR\scratch\finalize_stage.py"
if ($LASTEXITCODE -ne 0) { throw "finalize_stage.py failed!" }

Write-Host ""
Write-Host "==================================================================" -ForegroundColor Green
Write-Host " [REPRODUCE PASS] All unit tests, contracts and hashes passed 100%!" -ForegroundColor Green
Write-Host " Gate B verdict is FAIL. Representative replays in artifacts/failed_replays/" -ForegroundColor Green
Write-Host "==================================================================" -ForegroundColor Green
