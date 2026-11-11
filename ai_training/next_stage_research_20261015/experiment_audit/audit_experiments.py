"""只读重算历史实验计数与身份；只在本研究子目录写入审计结果。"""
from __future__ import annotations

import collections
import datetime
import hashlib
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
HERE = Path(__file__).resolve().parent
TRAIN = ROOT / "ai_training"
R8 = TRAIN / "r8_pure_policy_stage_20261014_125300"
R9 = TRAIN / "r9_decision_chain_stage_20261014_225400"
R9B = TRAIN / "r9b_commander_stage_20261014_231000"
R9C = TRAIN / "r9c_eval_completion_20261014_235100"
R10 = TRAIN / "r10_terminal_chain_20261015_024000"
R11 = TRAIN / "r11_onpolicy_multifamily_20261015_030800"
R12 = TRAIN / "r12_first_disagreement_20261015_034900"
READS = {}


def sha(path):
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def load(path):
    raw = path.read_bytes()
    READS[str(path.relative_to(ROOT))] = {
        "sha256": hashlib.sha256(raw).hexdigest(), "bytes": len(raw),
        "mtime_ns": path.stat().st_mtime_ns,
    }
    return json.loads(raw.decode("utf-8-sig"))


def rows(path):
    obj = load(path)
    return obj.get("rows", obj.get("results", []))


def panel(path):
    obj = load(path)
    rr = obj.get("rows", obj.get("results", []))
    counts = dict(collections.Counter(x["outcome"] for x in rr))
    return {
        "path": str(path.relative_to(ROOT)), "games": len(rr), "counts": counts,
        "stored_counts_equal": obj.get("counts") == counts,
        "natural_win_slots": [r.get("gameIndex", r.get("caseIndex")) for r in rr if r["outcome"] == "natural_win"],
        "maps": sorted({r.get("mapName", "未知") for r in rr}),
        "sum_completed_wall_seconds": sum(r.get("elapsedWallSeconds", 0) for r in rr),
    }


result = {
    "observed_at": datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=8))).isoformat(),
    "scope": "只读历史产物；未运行训练、对局或手机控制；未重做完整合法重放或PT反序列化",
}

r8_panels = {}
for p in sorted((R8 / "runs").glob("*/summary.json")):
    psummary = panel(p)
    actual = [load(x) for x in sorted(p.parent.glob("game_*.json"))]
    psummary["individual_metadata_counts"] = dict(collections.Counter(r["outcome"] for r in actual))
    psummary["individual_metadata_agrees"] = psummary["counts"] == psummary["individual_metadata_counts"]
    r8_panels[p.parent.name] = psummary
result["r8_panels"] = r8_panels
result["r8_final_verdict"] = load(R8 / "evidence/final_acceptance_verdict.json")

# 只统计已保存决策，超时中被杀的未完成决策不进入耗时分位数。
def quantiles(values):
    values = sorted(values)
    return {str(q): values[min(len(values) - 1, math.ceil(len(values) * q) - 1)] for q in (0.5, 0.95, 0.99, 1.0)} if values else {}


result["r8_saved_trace_telemetry"] = {}
for name in ("dev_r1_warm", "final_r8", "dev_b100_q", "dev_b100_r"):
    duration, legal_counts, action_counts = [], [], collections.Counter()
    for p in sorted((R8 / "runs" / name).glob("game_*.jsonl")):
        game = load(p.with_suffix(".json"))
        READS[str(p.relative_to(ROOT))] = {"sha256": sha(p), "bytes": p.stat().st_size, "mtime_ns": p.stat().st_mtime_ns}
        with p.open(encoding="utf-8") as f:
            for line in f:
                r = json.loads(line)
                if r.get("type") == "step" and r["player"] == game["candidateSeat"]:
                    duration.append(r["elapsedMs"])
                    legal_counts.append(r["legalCount"])
                    action_counts[r["action"]["type"]] += 1
    result["r8_saved_trace_telemetry"][name] = {
        "completed_candidate_decisions": len(duration), "elapsed_ms_quantiles": quantiles(duration),
        "legal_count_quantiles": quantiles(legal_counts), "actions": dict(action_counts),
        "scope": "保存的完整决策；包含编码、记录与转移相关耗时，非纯神经前向，非当前设备新测速",
    }

result["r9_controlled_panels"] = {}
for p in (R9 / "tiny_fit").glob("*results*.json"):
    obj = load(p)
    result["r9_controlled_panels"][p.name] = obj if p.stat().st_size < 12000 else {"keys": list(obj)}
result["r9c_completed_panels"] = {
    name: panel(R9B / f"joint/independent_results_{name}.json")
    for name in ("frozen_anchor", "replay_control", "safety_course")
}
result["r10_panels"] = {
    name: panel(R10 / f"results_{name}.json")
    for name in ("r8_anchor", "frozen_parent", "single_correction", "terminal_chain")
}

result["r11"] = {}
for name in ("original_results", "branch_results", "censoring_continuation_results", "teacher_control_results"):
    p = R11 / f"{name}.json"
    rr = rows(p)
    result["r11"][name] = {
        "rows": len(rr), "counts": dict(collections.Counter(r.get("outcome", "无结果") for r in rr)),
        "natural_win_cases": [r.get("caseIndex") for r in rr if r.get("outcome") == "natural_win"],
    }
result["r11"]["data_gate"] = load(R11 / "data_gate.json")

primary = rows(R12 / "primary_results.json")
r12_groups = {}
for h in (0, 8, 16):
    rr = [r for r in primary if r["referenceHandoffs"] == h]
    r12_groups[str(h)] = {
        "rows": len(rr), "counts": dict(collections.Counter(r["outcome"] for r in rr)),
        "wins": [{k: r[k] for k in ("caseIndex", "familyId", "mapName", "candidateSeat", "rootStep", "steps", "returnedStudentDecisions", "teacherDecisions")} for r in rr if r["outcome"] == "natural_win"],
    }
baseline = {r["caseIndex"]: r for r in primary if r["referenceHandoffs"] == 0}
eligible = [r for r in primary if r["referenceHandoffs"] > 0 and r["outcome"] == "natural_win" and r["returnedStudentDecisions"] > 0 and baseline[r["caseIndex"]]["outcome"] == "natural_loss"]
result["r12"] = {
    "groups": r12_groups,
    "eligible_improvement_families": sorted({r["familyId"] for r in eligible}),
    "eligible_improvement_maps": sorted({r["mapName"] for r in eligible}),
    "eligible_improvement_seats": sorted({r["candidateSeat"] for r in eligible}),
    "repeat_rows": len(rows(R12 / "repeat_results.json")),
    "data_gate": load(R12 / "data_gate.json"),
}

manifest = load(R8 / "identity/manifest.json")
identities = []
for entry in manifest["files"]:
    src = ROOT / Path(entry["source"])
    frozen = R8 / Path(entry["frozen"])
    current_sha = sha(src) if src.is_file() else None
    frozen_sha = sha(frozen) if frozen.is_file() else None
    identities.append({
        "source": entry["source"], "expected_original_sha256": entry["sourceSha256"],
        "current_sha256": current_sha, "current_matches_original": current_sha == entry["sourceSha256"],
        "expected_frozen_sha256": entry["frozenSha256"], "observed_frozen_sha256": frozen_sha,
        "frozen_matches": frozen_sha == entry["frozenSha256"],
    })
result["r8_rule_identity"] = {"files": identities, "total": len(identities),
    "current_drift": [i["source"] for i in identities if not i["current_matches_original"]],
    "frozen_drift": [i["source"] for i in identities if not i["frozen_matches"]]}

models = {}
for name, summary in r8_panels.items():
    first = load(R8 / "runs" / name / "game_0.json")
    spec = first["candidate"]
    if spec["type"] != "model":
        models[name] = {"type": spec["type"], "weight_file": None}
        continue
    p = Path(spec["model"])
    if not p.is_absolute():
        p = ROOT / p
    obj = load(p)
    layers = [v for v in obj.values() if isinstance(v, dict) and "weights" in v]
    siblings = [{"name": x.name, "bytes": x.stat().st_size, "sha256": sha(x)} for x in p.parent.glob("*.pt")]
    models[name] = {
        "path": str(p.relative_to(ROOT)), "sha256": sha(p), "expected_sha256": spec.get("expectedSha256"),
        "schema": obj.get("encoderSchemaId"), "architecture": obj.get("architectureId"),
        "parameters": sum(len(l.get("weights", [])) + len(l.get("biases", [])) for l in layers),
        "stem_channels": obj.get("stem", {}).get("inChannels"), "pt_siblings": siblings,
    }
parent = R9B / "joint/training/replay_control/last.json"
obj = load(parent)
models["r9b_frozen_parent"] = {"path": str(parent.relative_to(ROOT)), "sha256": sha(parent),
    "schema": obj.get("encoderSchemaId"), "pt_exists": parent.with_suffix(".pt").is_file()}
result["representative_models"] = models

result["current_dataset_presence"] = {}
for rel in ("data/base_locked/train.jsonl.gz", "data/base_locked/val.jsonl.gz", "data/dagger_locked/train.jsonl.gz", "data/dagger_locked/val.jsonl.gz"):
    p = R8 / rel
    result["current_dataset_presence"][rel] = {"exists": p.is_file(), "bytes": p.stat().st_size if p.is_file() else None, "sha256": sha(p) if p.is_file() else None}

deletion = load(ROOT / "captures/legacy2500-deletion-20261015-224604/deletion-record.json")
result["legacy2500_deleted_files"] = {
    "record_count": len(deletion["files"]),
    "total_recorded_bytes": sum(r["bytes"] for r in deletion["files"]),
    "still_exists": [r["path"] for r in deletion["files"] if Path(r["path"]).exists()],
}

result["read_consistency"] = {
    "changed_after_read": [name for name, info in READS.items() if sha(ROOT / name) != info["sha256"]],
    "checked_files": len(READS),
}
result["inputs"] = READS
out = HERE / "experiment_audit.json"
out.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
summary = {
    "observed_at": result["observed_at"], "scope": result["scope"],
    "r8_counts": {k: v["counts"] for k, v in r8_panels.items()},
    "r9c_counts": {k: v["counts"] for k, v in result["r9c_completed_panels"].items()},
    "r10_counts": {k: v["counts"] for k, v in result["r10_panels"].items()},
    "r12": result["r12"], "r8_saved_trace_telemetry": result["r8_saved_trace_telemetry"],
    "rule_identity": {k: result["r8_rule_identity"][k] for k in ("total", "current_drift", "frozen_drift")},
    "deleted_assets": result["legacy2500_deleted_files"],
    "current_dataset_presence": result["current_dataset_presence"],
    "read_consistency": result["read_consistency"],
}
(HERE / "summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
print(json.dumps({"output": str(out), "r8_panels": {k: v["counts"] for k, v in r8_panels.items()},
    "current_rule_drift": result["r8_rule_identity"]["current_drift"],
    "r12_eligible_families": result["r12"]["eligible_improvement_families"],
    "deleted_files_still_exists": result["legacy2500_deleted_files"]["still_exists"]}, ensure_ascii=False, indent=2))
