# ==============================================================================
# AncientEmpires r4 规则研究与教师验证阶段 - 一键完全复现脚本
# ==============================================================================

$ErrorActionPreference = "Stop"
$STAGE_DIR = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "==================================================================" -ForegroundColor Cyan
Write-Host " [REPRODUCE] 开始执行阶段全量自动化复现验证" -ForegroundColor Cyan
Write-Host " 工作区: $STAGE_DIR" -ForegroundColor Cyan
Write-Host " 规则版本: apk-4.2.5.1-rules-20261013-r4" -ForegroundColor Cyan
Write-Host "==================================================================" -ForegroundColor Cyan

# 1. 验证冻结环境规则回归测试
Write-Host "`n>>> [1/6] 运行冻结独立环境规则回归测试 (285 项单测)..." -ForegroundColor Yellow
Push-Location "$STAGE_DIR\env"
npm test
if ($LASTEXITCODE -ne 0) { throw "独立环境 npm test 失败！" }
Pop-Location

# 2. 运行严格裁判与重放一致性测试
Write-Host "`n>>> [2/6] 运行严格裁判、精确重放与进程硬超时测试 (T01)..." -ForegroundColor Yellow
npx vitest run "$STAGE_DIR\research\match_runner.test.ts"
if ($LASTEXITCODE -ne 0) { throw "match_runner.test.ts 失败！" }

# 3. 运行评测统计与 Bootstrap 95% CI 测试
Write-Host "`n>>> [3/6] 运行分层 Bootstrap 95% 置信区间评测测试 (T02)..." -ForegroundColor Yellow
npx vitest run "$STAGE_DIR\research\evaluate.test.ts"
if ($LASTEXITCODE -ne 0) { throw "evaluate.test.ts 失败！" }

# 4. 运行特征表示与 Golden 样本重建测试
Write-Host "`n>>> [4/6] 运行固定特征契约与 Golden 样本 100% 精确重建测试 (T03)..." -ForegroundColor Yellow
npx vitest run "$STAGE_DIR\research\features.test.ts"
if ($LASTEXITCODE -ne 0) { throw "features.test.ts 失败！" }

# 5. 运行搜索教师与消融配置测试
Write-Host "`n>>> [5/6] 运行搜索教师与消融配置测试 (T05)..." -ForegroundColor Yellow
npx vitest run "$STAGE_DIR\research\search_teacher.test.ts"
if ($LASTEXITCODE -ne 0) { throw "search_teacher.test.ts 失败！" }

# 6. 执行全局元数据生成与受保护主项目哈希核验
Write-Host "`n>>> [6/6] 运行全局元数据生成与 14 个受保护核心文件哈希核验..." -ForegroundColor Yellow
python "$STAGE_DIR\scratch\finalize_stage.py"
if ($LASTEXITCODE -ne 0) { throw "finalize_stage.py 失败！" }

Write-Host "`n==================================================================" -ForegroundColor Green
Write-Host " [REPRODUCE PASS] 阶段全部工程单测、数据契约、哈希核验均 100% 通过！" -ForegroundColor Green
Write-Host " 详细 Gate A/B 报告与战术回放见 reports/ 目录。" -ForegroundColor Green
Write-Host "==================================================================" -ForegroundColor Green
