"""冻结覆盖实验候选及原协议源码身份，不执行对局。"""
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
RUN = ROOT / "v19/out/coverage_20261004"

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def main():
    destination = RUN / "arena_identity.json"
    if destination.exists():
        raise FileExistsError(destination)
    previous_path = ROOT / "v19/out/continuous16_20261003/path3_experiment_identity.json"
    previous = json.loads(previous_path.read_text(encoding="utf-8"))
    source_text = (ROOT / "v16/tools/eval_v16_identity.ts").read_text(encoding="utf-8")
    groups = {}
    files = {}
    for group in ("engine", "policy", "h0", "runner"):
        match = re.search(r"export const " + group.upper() + r"_SOURCE_FILES_V16[^=]*=\s*\[([\s\S]*?)\];", source_text)
        if not match:
            raise ValueError(group)
        paths = sorted(re.findall(r"'([^']+)'", match.group(1)))
        files[group] = {p: sha(ROOT / p) for p in paths}
        groups[group] = hashlib.sha256("\n".join(p + ":" + files[group][p] for p in paths).encode()).hexdigest()
    if groups != previous["arenaRowSourceDigests"]:
        raise ValueError("评测源码身份与上一轮冻结身份不同，禁止开始")
    curve = json.loads((RUN / "checkpoint_curve.json").read_text(encoding="utf-8"))
    candidates = []
    for arm in ("trunk_full", "head_kl"):
        model = RUN / "training" / arm / "final.json"
        digest = sha(model)
        entry = next(x for x in curve["checkpoints"] if x["sha256"] == digest)
        parity_path = RUN / "parity" / arm / "report.json"
        parity = json.loads(parity_path.read_text(encoding="utf-8"))
        if not parity["passed"] or parity["checkpoint"]["sha256"] != digest:
            raise ValueError("模型前向校验未通过")
        candidates.append({"arm": arm, "model": str(model.relative_to(ROOT)).replace("\\", "/"),
                           "sha256": digest, "parityReportSha256": sha(parity_path),
                           "currentMacro": entry["validationBySource"]["previously_consumed_current_rules_regression_only"]["macroFamily"]})
    candidates.sort(key=lambda x: (-x["currentMacro"]["top1Accuracy"], x["currentMacro"]["crossEntropy"]))
    result = {"schema": "v19_coverage_arena_identity_1", "selection": "固定最终点，现行宏Top1降序、CE升序；不按DEV调参",
              "candidates": candidates, "arenaRowSourceDigests": groups, "sourceFiles": files,
              "previousIdentitySha256": sha(previous_path), "allArenaSourceGroupsUnchanged": True,
              "panel": {"devBaseSeed": 2609260100, "confirmBaseSeed": 2609260300, "games": 20,
                        "maxSteps": 12000, "maxPlies": None, "wallTimeoutMs": 900000},
              "goalAchieved": False, "checkpointCurveSha256": sha(RUN / "checkpoint_curve.json"),
              "builderSha256": sha(Path(__file__))}
    destination.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"candidates": candidates, "allArenaSourceGroupsUnchanged": True}, ensure_ascii=False))

if __name__ == "__main__":
    main()
