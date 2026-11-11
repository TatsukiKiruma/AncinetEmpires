"""V17/T17-03：B100 迁入副本的**保真性结构核对**（独立于迁入者的自检）。

只读外部源与本地副本，规范化（去注释、折叠空白）后做序列比对，回答一个具体问题：

    「外部 teacher 的决策逻辑里，有没有哪一行在迁入副本里**消失**了？」

由于本地副本按细则要求加了非行为性插桩（clone/step/打分计时、catch 计数），
真正的逻辑行应当**全部保留**，只是被包装成 `this.cloneEngine(...)` / `this.stepEngine(...)` /
`this.evaluateLeaf(...)` / `this.chooseWithHeuristic(...)` 这类同名转发。
因此本脚本把「只在外部出现」的行打印出来，供人工确认它们全部属于下列可解释类别：

    * import 行（路径必须改）
    * `engine.clone()` / `sim.step(x)` / `evaluatePositionHeuristic(...)` / `heuristic.getAction(...)`
      —— 被插桩包装取代
    * `mulberryDefault` —— 被可序列化 RNG 取代（R 版需要保存/恢复 uint32 状态）

用法：
  & 'C:\\Users\\SHIINA\\AppData\\Local\\Programs\\Python\\Python312\\python.exe' `
    v17/tools/check_b100_port_fidelity.py --json v17/out/v17_20260926_r2/teacher/port_fidelity.json
"""

from __future__ import annotations

import argparse
import difflib
import hashlib
import json
import re
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
EXTERNAL = Path(r"C:\code\AncinetEmpires-100pct\src\game\ai\battle_search_ai.ts")
LOCAL = REPO / "v17" / "teachers" / "battle_search_b100.ts"

EXPLAINABLE_PREFIXES = (
    "import ",
    "function mulberryDefault(",
    "const sim = engine.clone();",
    "sim.step(",
    "const probe = sim.clone();",
    "probe.step(",
    "return evaluatePositionHeuristic(",
    "let worst = evaluatePositionHeuristic(",
    "const leaf = evaluatePositionHeuristic(",
    "follow = this.heuristic.getAction(",
)


def normalise(path: Path) -> list[str]:
    text = path.read_text(encoding="utf-8")
    text = re.sub(r"/\*.*?\*/", "", text, flags=re.S)
    text = re.sub(r"//[^\n]*", "", text)
    out = []
    for line in text.split("\n"):
        stripped = re.sub(r"\s+", " ", line).strip()
        if stripped:
            out.append(stripped)
    return out


def classify(line: str) -> str:
    for prefix in EXPLAINABLE_PREFIXES:
        if line.startswith(prefix):
            return "explained"
    return "UNEXPLAINED"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--json", default=None)
    args = parser.parse_args()

    if not EXTERNAL.exists():
        raise SystemExit(f"外部源不存在（只读工作区应为 C:\\code\\AncinetEmpires-100pct）：{EXTERNAL}")
    if not LOCAL.exists():
        raise SystemExit(f"迁入副本不存在：{LOCAL}")

    ext = normalise(EXTERNAL)
    loc = normalise(LOCAL)
    matcher = difflib.SequenceMatcher(None, ext, loc, autojunk=False)

    external_only: list[str] = []
    for tag, i1, i2, _j1, _j2 in matcher.get_opcodes():
        if tag in ("delete", "replace"):
            external_only.extend(ext[i1:i2])

    classified = [(line, classify(line)) for line in external_only]
    unexplained = [line for line, kind in classified if kind == "UNEXPLAINED"]

    report = {
        "schema": "v17_b100_port_fidelity_1",
        "externalPath": str(EXTERNAL),
        "externalSha256": hashlib.sha256(EXTERNAL.read_bytes()).hexdigest(),
        "localPath": str(LOCAL.relative_to(REPO)).replace("\\", "/"),
        "localSha256": hashlib.sha256(LOCAL.read_bytes()).hexdigest(),
        "normalisedExternalLines": len(ext),
        "normalisedLocalLines": len(loc),
        "sequenceRatio": round(matcher.ratio(), 4),
        "externalOnlyLines": len(external_only),
        "explainedExternalOnlyLines": len(external_only) - len(unexplained),
        "unexplainedExternalOnlyLines": len(unexplained),
        "unexplained": unexplained[:50],
        "verdict": "FAITHFUL_WITH_INSTRUMENTATION" if not unexplained else "NEEDS_REVIEW",
        "method": (
            "去注释 + 折叠空白后做 difflib 序列比对；『只在外部出现』的行必须全部落在"
            " import / cloneEngine / stepEngine / evaluateLeaf / chooseWithHeuristic / 可序列化 RNG 这几类"
            "被插桩包装或按细则要求替换的语句上。任何其他消失行都视为决策逻辑丢失。"
        ),
        "limitation": (
            "结构比对不能证明数值行为逐位相同；运行时一致性仍以 200x3 恢复查询 + 插桩开关动作一致为准。"
        ),
    }
    if args.json:
        out = Path(args.json)
        if not out.is_absolute():
            out = REPO / out
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if not unexplained else 1


if __name__ == "__main__":
    raise SystemExit(main())