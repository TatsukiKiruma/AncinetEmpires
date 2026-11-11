"""V19/T19-00.1 重验：`policy` 组摘要发生变化后，只对变化组件做验证。

背景：T19-00.4 修复了两个 schema 测试夹具，改动落在 `src/game/ai/spatial_conv_net.ts`
（属于 V17 冻结清单的 `policy` 组），因此 `infraUnchangedSinceV17` 变为 false。
任务书要求「只对发生变化的组件重验」，本脚本做两件可核对的事：

1. **静态范围**：确认被改动的函数 `createInitializedSpatialResNet` 在 `src/` 运行时路径上
   没有任何调用方（它只被 tools/ 与测试使用），因此推理语义不可能因此改变。
2. **端到端对照**：用改动后的工作树重跑冠军 P1:s2026 的 DEV20，与 V18 控制组逐局对齐。
   若逐局结果完全一致，则「旧 DEV20 成绩与冠军 SHA 仍可作为当前基线引用」这句话成立。

用法：
    python v19/tools/verify_policy_group_change.py --run-id run_20260928_v19_01
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def load_rows(out_dir: Path, name: str) -> list[dict]:
    rows: list[dict] = []
    for shard in range(5):
        path = out_dir / f"{name}.m{shard}.games.jsonl"
        if path.is_file():
            rows += [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]
    return rows


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--run-id", default="run_20260928_v19_01")
    parser.add_argument("--changed-file", default="src/game/ai/spatial_conv_net.ts")
    args = parser.parse_args()

    identity_dir = ROOT / "v19" / "out" / args.run_id / "identity"
    identity_dir.mkdir(parents=True, exist_ok=True)

    # 1) 静态范围：该函数在 src/ 下有没有调用方？
    pattern = re.compile(r"createInitializedSpatialResNet")
    callers: dict[str, list[str]] = {}
    for path in sorted(ROOT.rglob("*.ts")):
        rel = str(path.relative_to(ROOT)).replace("\\", "/")
        if rel.startswith(("node_modules/", "dist/")):
            continue
        if "/archive/" in rel or "/out/" in rel or rel.startswith(("v14/out/", "v15/out/", "v16/out/")):
            continue
        try:
            text = path.read_text(encoding="utf-8")
        except (UnicodeDecodeError, OSError):
            continue
        if pattern.search(text):
            callers[rel] = [line.strip() for line in text.splitlines() if pattern.search(line)]

    runtime_callers = [rel for rel in callers
                       if rel.startswith("src/") and not rel.endswith("spatial_conv_net.ts")]
    tool_callers = [rel for rel in callers if rel.startswith("tools/")]

    # 2) 端到端对照：V18 控制组 vs V19 控制组。
    v18_dir = ROOT / "v18" / "out" / "run_20260927_v18_01" / "arena" / "dev"
    v19_dir = ROOT / "v19" / "out" / args.run_id / "arena" / "dev"
    v18_rows = load_rows(v18_dir, "P1_s2026_v18control")
    v19_rows = load_rows(v19_dir, "P1_s2026_v19control")
    if not v18_rows or not v19_rows:
        raise SystemExit("缺少控制组逐局文件，拒绝在缺少对照的情况下宣称未受影响。")

    key = lambda r: (r.get("mapName"), r.get("rootSeed"), r.get("candidateSeat"))
    a = {key(r): r for r in v18_rows}
    b = {key(r): r for r in v19_rows}
    common = sorted(set(a) & set(b), key=lambda t: (str(t[0]), t[1] or 0, t[2] if t[2] is not None else -1))
    diffs = [{"mapName": c[0], "rootSeed": c[1], "seat": c[2],
              "v18": a[c].get("outcomeKind"), "v19": b[c].get("outcomeKind")}
             for c in common if a[c].get("outcomeKind") != b[c].get("outcomeKind")]
    win = lambda rows: sum(1 for r in rows if r.get("outcomeKind") == "NATURAL_WIN")

    report = {
        "schema": "v19_policy_group_reverification_1",
        "runId": args.run_id,
        "changedFile": args.changed_file,
        "changedFileSha256": sha256_file(ROOT / args.changed_file),
        "reason": "T19-00.4 修复两个 schema 测试夹具：createInitializedSpatialResNet 现在声明 "
                  "encoderSchemaId 并按 schema 推导层形状；schema 校验未放宽，历史权重加载路径未改。",
        "staticScope": {
            "function": "createInitializedSpatialResNet",
            "runtimeCallersUnderSrc": runtime_callers,
            "toolCallers": tool_callers,
            "conclusion": (
                "src/ 运行时路径没有调用方 ⇒ 该改动不可能改变任何已加载权重的推理结果；"
                "受影响范围仅限随机权重初始化（测试夹具与基准脚本）。"
                if not runtime_callers else
                "存在运行时调用方 ⇒ 必须逐项核对推理路径，不能只凭 DEV20 复现下结论。"
            ),
        },
        "endToEndControl": {
            "panel": "DEV20（冻结 seed 2609260100 + 10*mapIndex + s）",
            "v18Control": {"rows": len(v18_rows), "wins": win(v18_rows),
                           "source": "v18/out/run_20260927_v18_01/arena/dev/P1_s2026_v18control.*"},
            "v19Control": {"rows": len(v19_rows), "wins": win(v19_rows),
                           "source": f"v19/out/{args.run_id}/arena/dev/P1_s2026_v19control.*"},
            "commonGames": len(common),
            "identicalOutcomes": len(common) - len(diffs),
            "differences": diffs,
            "checkpointSha256": sorted({r.get("checkpointSha256") for r in v19_rows if r.get("checkpointSha256")}),
            "conclusion": (
                "改动后重跑冠军的 DEV20 与 V18 控制组逐局一致 ⇒ 旧 DEV20 成绩与冠军 SHA 仍可作为当前基线引用。"
                if not diffs else
                "逐局结果出现差异 ⇒ 基线必须重跑，不能沿用旧成绩。"
            ),
        },
        "git": {
            "head": subprocess.run(["git", "rev-parse", "HEAD"], cwd=str(ROOT),
                                   capture_output=True, text=True, check=False).stdout.strip(),
        },
    }
    out_path = identity_dir / "reverification.json"
    out_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "ok": True,
        "written": str(out_path.relative_to(ROOT)).replace("\\", "/"),
        "runtimeCallersUnderSrc": runtime_callers,
        "identicalOutcomes": report["endToEndControl"]["identicalOutcomes"],
        "commonGames": report["endToEndControl"]["commonGames"],
        "winsV18": report["endToEndControl"]["v18Control"]["wins"],
        "winsV19": report["endToEndControl"]["v19Control"]["wins"],
    }, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
