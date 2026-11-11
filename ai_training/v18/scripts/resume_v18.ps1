# V18 run resume entry — run_20260927_v18_01
#
# 中文说明：
# - 本文件是**真实可执行**的续跑入口，命令全部在本机 PowerShell 里跑过。
# - 不覆盖 v17/ 任何产物；所有输出写 v18/out/run_20260927_v18_01/。
# - 当前冠军仍是 v16 P1:s2026（DEV20 5/20），V18 总目标（独立 CONFIRM20 >= 18/20）**未达成**。
#
# 用法（仓库根目录）：
#   pwsh -NoProfile -ExecutionPolicy Bypass -File v18/scripts/resume_v18.ps1 -Step identity
#   pwsh -NoProfile -ExecutionPolicy Bypass -File v18/scripts/resume_v18.ps1 -Step val
#   pwsh -NoProfile -ExecutionPolicy Bypass -File v18/scripts/resume_v18.ps1 -Step arms -Arms A,B
#   pwsh -NoProfile -ExecutionPolicy Bypass -File v18/scripts/resume_v18.ps1 -Step dev20 -ModelKey T18_02_A_final -Model v18/out/run_20260927_v18_01/experiments/T18_02_A/A_final.json

param(
    [ValidateSet('identity', 'labels', 'val', 'probe', 'separation', 'rescore', 'arms', 'dev20', 'counterfactual', 's1', 's2', 's3', 's4', 's5', 't18_04', 'recheck_manifest', 'valuegate')]
    [string]$Step = 'identity',
    [string]$Arms = 'A,B',
    [string]$ModelKey = '',
    [string]$Model = '',
    [string]$RunId = 'run_20260927_v18_01'
)

$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
Set-Location $repo
$env:PYTHONIOENCODING = 'utf-8'
$py = 'C:\Users\SHIINA\AppData\Local\Programs\Python\Python312\python.exe'
$run = "v18/out/$RunId"
$v17 = 'v17/out/v17_20260926_r2'

function Invoke-Tool([string[]]$ToolArgs) {
    & node --openssl-legacy-provider v12/tools/run-tool.mjs @ToolArgs
}

switch ($Step) {
    'identity' {
        & $py v18/tools/freeze_v18_identity.py --run-id $RunId
    }
    'labels' {
        Invoke-Tool @('v18/tools/l1_v18_selftest.ts', '--per-map', '60')
        Invoke-Tool @('v18/tools/label_l1_v18_val.ts', '--rollouts', "$v17/data/new_val/rollouts/val_h0.allmaps.jsonl", '--out', "$run/labels/l1_v18.val_h0.allmaps.jsonl", '--resume', 'false')
    }
    'probe' {
        Invoke-Tool @('v18/tools/probe_opening_states_v18.ts', '--run-id', $RunId, '--prefixes-per-map', '60', '--max-turns', '2')
    }
    'val' {
        & $py v18/tools/build_v18_val_manifest.py --run-id $RunId
    }
    'separation' {
        & $py v18/tools/check_train_val_separation.py --run-id $RunId
        & $py v18/tools/analyze_val_overlap_by_phase.py --run-id $RunId
        & $py v18/tools/spotcheck_shared_inputs.py --run-id $RunId
        & $py v18/tools/audit_trainer_val_vs_v18.py --run-id $RunId
    }
    'rescore' {
        & $py v18/tools/verify_arm_b_logits_parity.py --run-id $RunId --rows 300
        & $py v18/tools/rescore_checkpoints_v18.py --run-id $RunId --independence-class UNSEEN_INPUT_VALIDATION
        & $py v18/tools/rescore_checkpoints_v18.py --run-id $RunId --independence-class ALL
    }
    'arms' {
        pwsh -NoProfile -ExecutionPolicy Bypass -File v18/scripts/t18_02_arms_train.ps1 -Arms $Arms -Updates 4000 -RunId $RunId
    }
    'dev20' {
        if ([string]::IsNullOrEmpty($Model) -or [string]::IsNullOrEmpty($ModelKey)) {
            throw "[resume_v18] -Step dev20 需要 -ModelKey 与 -Model。"
        }
        pwsh -NoProfile -ExecutionPolicy Bypass -File v18/scripts/run_panel_sharded_v18.ps1 -RunId $RunId -Panel dev -ModelKey $ModelKey -Model $Model
    }
    'counterfactual' {
        $files = (0..4 | ForEach-Object { "$v17/data/new_train/rollouts/train_student_P1s2026.m$_.jsonl" }) -join ','
        Invoke-Tool @('v18/tools/counterfactual_v18.ts', '--run-id', $RunId, '--rollouts', $files, '--target-windows', '48', '--max-per-root', '3')
    }
    's1' {
        # S1：只把续弈预算提到 1024 转换 / 120 秒，输出到独立文件不覆盖 S0。
        $files = (0..4 | ForEach-Object { "$v17/data/new_train/rollouts/train_student_P1s2026.m$_.jsonl" }) -join ','
        Invoke-Tool @('v18/tools/counterfactual_v18.ts', '--run-id', $RunId, '--rollouts', $files, '--target-windows', '24', '--max-per-root', '2', '--max-transitions', '1024', '--wall-ms', '120000', '--out-tag', 'S1horizon')
        & $py v18/tools/analyze_preference_repeatability.py --run-id $RunId --branches "$run/counterfactual/paired_continuation.S1horizon.branches.jsonl" --out-name preference_repeatability.S1horizon.json
    }
    's2' {
        # S2：干预单位换成主体整局策略，标签换成真实自然终局。
        # 注意：逗号分隔的参数必须加引号，否则 PowerShell 会拆成多个参数。
        Invoke-Tool @('v18/tools/fullgame_ab_v18.ts', '--run-id', $RunId, '--windows', '16', '--policies', 'student,h0,b100q', '--continuation-seeds', '2026099901,2026099902', '--max-steps', '6000', '--wall-ms', '180000', '--out-tag', 'S2fullgame')
        & $py v18/tools/analyze_fullgame_ab.py --run-id $RunId --tag S2fullgame
    }
    's3' {
        # S3：只换窗口选择规则，限定「局面未定」区域。
        Invoke-Tool @('v18/tools/fullgame_ab_v18.ts', '--run-id', $RunId, '--windows', '16', '--policies', 'student,h0', '--continuation-seeds', '2026099901,2026099902,2026099903', '--max-steps', '6000', '--wall-ms', '180000', '--balance-filter', 'balanced', '--sample-seed', '2026099905', '--out-tag', 'S3balanced')
        & $py v18/tools/analyze_fullgame_ab.py --run-id $RunId --tag S3balanced
    }
    's4' {
        # S4：把平衡判据搬到便宜的单动作成对续弈上（结论：仍不超过随机）。
        $files = (0..4 | ForEach-Object { "$v17/data/new_train/rollouts/train_student_P1s2026.m$_.jsonl" }) -join ','
        Invoke-Tool @('v18/tools/counterfactual_v18.ts', '--run-id', $RunId, '--rollouts', $files, '--target-windows', '32', '--max-per-root', '2', '--max-transitions', '256', '--wall-ms', '30000', '--balance-filter', 'balanced', '--selection-seed', '2026099921', '--out-tag', 'S4balanced')
        & $py v18/tools/analyze_preference_repeatability.py --run-id $RunId --branches "$run/counterfactual/paired_continuation.S4balanced.branches.jsonl" --out-name preference_repeatability.S4balanced.json
    }
    's5' {
        # S5：平衡局面上三个策略的整局 A/B（student / h0 / b100q）。
        # 注意：逗号分隔的参数必须加引号，否则 PowerShell 会拆成多个参数。
        Invoke-Tool @('v18/tools/fullgame_ab_v18.ts', '--run-id', $RunId, '--windows', '16', '--policies', 'student,h0,b100q', '--continuation-seeds', '2026099901,2026099902,2026099903', '--max-steps', '6000', '--wall-ms', '180000', '--balance-filter', 'balanced', '--sample-seed', '2026099931', '--out-tag', 'S5balancedTeacher')
        & $py v18/tools/analyze_fullgame_ab.py --run-id $RunId --tag S5balancedTeacher
    }
    't18_04' {
        # T18-04 第 1 波：定向平衡局面的两臂（无约束 vs KL 约束）。
        Invoke-Tool @('v18/tools/extract_balanced_keys_v18.ts', '--run-id', $RunId)
        & $py v18/tools/build_t18_04_dataset.py --run-id $RunId --replay-rows 4000
        pwsh -NoProfile -ExecutionPolicy Bypass -File v18/scripts/t18_04_wave1_train.ps1 -Arms U,K -Updates 4000 -RunId $RunId
    }
    'recheck_manifest' {
        # 冻结 RECHECK40 面板并做 namespace / family 交集检查（不运行面板）。
        & $py v18/tools/freeze_recheck40_manifest.py --run-id $RunId --wave 1
    }
    'valuegate' {
        & $py v18/tools/value_ranking_gate.py --run-id $RunId
        & $py v18/tools/value_calibration_v18.py --run-id $RunId
    }
}
Write-Host "[resume_v18] step=$Step done"
