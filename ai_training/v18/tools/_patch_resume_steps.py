"""把 T18-04 / S4 / S5 的步骤补进 resume 脚本，保证下一轮能一条命令复跑。可重复执行。"""
import io
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
RESUME = ROOT / "v18" / "scripts" / "resume_v18.ps1"

NEW_STEPS = """    's4' {
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
    'valuegate' {"""

OLD_VALUEGATE = "    'valuegate' {"


def main() -> int:
    text = io.open(RESUME, encoding="utf-8").read()
    if "'s4'" in text and "'s5'" in text and "'t18_04'" in text:
        print("already present")
        return 0
    if OLD_VALUEGATE not in text:
        print("ERROR: anchor missing")
        return 2
    text = text.replace(OLD_VALUEGATE, NEW_STEPS, 1)
    text = text.replace(
        "[ValidateSet('identity', 'labels', 'val', 'probe', 'separation', 'rescore', 'arms', 'dev20', 'counterfactual', 's1', 's2', 's3', 'valuegate')]",
        "[ValidateSet('identity', 'labels', 'val', 'probe', 'separation', 'rescore', 'arms', 'dev20', 'counterfactual', 's1', 's2', 's3', 's4', 's5', 't18_04', 'recheck_manifest', 'valuegate')]",
    )
    io.open(RESUME, "w", encoding="utf-8").write(text)
    print("resume script updated")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
