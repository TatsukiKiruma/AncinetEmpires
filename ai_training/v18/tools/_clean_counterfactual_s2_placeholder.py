"""清理 `counterfactual_v18.ts` 里未接线的 S2 参数占位。

中文：edit 工具在该文件上返回 ReplaceFileW EIO，因此用字面替换脚本。
S2（阶段级干预）尚未实现，把未使用的参数声明删掉，避免出现「声明了但没接线」的假接口。
"""
import io
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
TARGET = ROOT / "v18" / "tools" / "counterfactual_v18.ts"

OLD = """/**
 * V18/T18-03 预登记搜索改进 S2：**干预粒度**。
 *
 * 中文：S0/S1 的干预是「只换第一个原子动作，然后全部交回 H0 续弈」。
 * 第一道门的诊断显示，首手差异会被同质的 H0 续弈迅速抹平。
 * S2 把干预改成**一整个玩家阶段**：主体的本次玩家阶段内，每一个决策都由分支策略给出，
 * 阶段结束之后才交回 H0。这不是「多试几次」，而是换了一个**假设更强的干预单位**。
 *
 * 取值：`action`（默认，S0/S1 行为）| `phase`（S2）。
 */
const BRANCH_MODE = arg('--branch-mode', 'action') as 'action' | 'phase';
if (BRANCH_MODE !== 'action' && BRANCH_MODE !== 'phase') {
    throw new Error(`[T18-03] 未知 --branch-mode '${BRANCH_MODE}'。`);
}
/** S2 下要对比的阶段策略。`student` 需要 --student-model。 */
const PHASE_POLICIES = (arg('--phase-policies', 'h0,b100q,student') as string)
    .split(',').map((s) => s.trim()).filter(Boolean);
const STUDENT_MODEL = arg('--student-model', 'v16/out/v16_20260926_core/experiments/P1/s2026/P1_final.json') as string;"""

NEW = """/*
 * V18/T18-03 预登记搜索改进 S2（**尚未实现，故意不留假接口**）：
 *
 * S0/S1 的干预单位是「只换第一个原子动作，然后全部交回 H0 续弈」。
 * 第一道门的诊断显示首手差异会被同质的 H0 续弈迅速抹平。
 * S2 计划把干预单位改成**一整个玩家阶段**（主体本阶段每个决策都由分支策略给出，
 * 阶段结束才交回 H0），并把分支从「动作」换成「策略」（H0 / B100-Q / 学生网络）。
 *
 * 这需要：把 `rollout` 重构成可注入策略的版本、加载学生网络的预测器、
 * 以及按策略而不是按动作生成分支。**在本轮预算内没有实现**，
 * 因此这里不声明 `--branch-mode` 之类的参数——声明了却没接线，比不声明更糟。
 */"""


def main() -> int:
    text = io.open(TARGET, encoding="utf-8").read()
    if NEW in text:
        print("already cleaned")
        return 0
    if OLD not in text:
        print("ERROR: anchor not found", file=sys.stderr)
        return 2
    io.open(TARGET, "w", encoding="utf-8").write(text.replace(OLD, NEW, 1))
    print("cleaned")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
