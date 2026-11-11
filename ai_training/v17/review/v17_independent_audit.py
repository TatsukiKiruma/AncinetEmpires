"""只读复算 V17 对战、训练元数据、验证标签和界面权重；输出独立审核记录。"""

from collections import Counter, defaultdict
from pathlib import Path
import hashlib
import json


REPO = Path(__file__).resolve().parents[2]
RUN = REPO / "v17/out/v17_20260926_r2"


def rows(path):
    with path.open(encoding="utf-8") as handle:
        for line in handle:
            if line.strip():
                yield json.loads(line)


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def audit_sources():
    manifest = json.loads((RUN / "identity/source_manifest.json").read_text(encoding="utf-8"))
    result = {}
    for name, group in manifest["groups"].items():
        mismatches = []
        for relative, expected in group["files"].items():
            path = REPO / relative
            actual = sha(path) if path.exists() else None
            if actual != expected:
                mismatches.append({"path": relative, "expected": expected, "actual": actual})
        result[name] = {"files": len(group["files"]), "mismatches": mismatches}
    return result


def scan_data(path):
    counts = Counter()
    sources = Counter()
    phases = Counter()
    families = set()
    keys = set()
    for row in rows(path):
        counts["rows"] += 1
        keys.add(row["actualInputKey"])
        families.add(row.get("trueFamilyId") or row.get("rootFamilyId"))
        sources[str(row.get("sourcePolicy"))] += 1
        phases[str(row.get("phaseBucket"))] += 1
        label = row["candidateActions"][row["targetActionIndex"]].get("actionCode")
        for field in ("l1ActionCode", "behaviorActionCode", "teacherActionCode"):
            if row.get(field) is not None:
                counts[f"{field}:present"] += 1
                counts[f"{field}:equalsTarget"] += int(label == row[field])
    return {
        **dict(counts), "uniqueInputs": len(keys), "families": len(families),
        "sources": dict(sources), "phases": dict(phases),
    }, keys


def main():
    report = {"scope": "当前工作树；不修改既有训练结果，不重训或重跑对战"}
    report["frozenSourceComparison"] = audit_sources()
    grouped = defaultdict(list)
    for folder in (RUN / "arena/dev", RUN / "teacher/arena"):
        for path in sorted(folder.glob("*.games.jsonl")):
            if path.name.startswith("smoke"):
                continue
            for row in rows(path):
                if row.get("arm") == "CANDIDATE":
                    grouped[path.name.split(".")[0]].append(row)
    arena = {}
    for name, games in sorted(grouped.items()):
        natural = [g for g in games if g["outcomeKind"] in ("NATURAL_WIN", "NATURAL_LOSS")]
        # 从胜方阵营独立重算，额外核对原 outcomeKind。
        wins = sum(g["winnerAllianceId"] == g["candidateAllianceId"] for g in natural)
        arena[name] = {
            "games": len(games), "wins": wins,
            "uniqueGameIds": len({g["gameId"] for g in games}),
            "outcomes": dict(Counter(g["outcomeKind"] for g in games)),
            "outcomeMismatches": sum((g["winnerAllianceId"] == g["candidateAllianceId"]) != (g["outcomeKind"] == "NATURAL_WIN") for g in natural),
            "fallbacks": sum(bool(g["fallbackUsed"]) for g in games),
            "hashes": sorted({g.get("checkpointSha256") or "非网络" for g in games}),
            "byMap": {m: {"games": sum(g["mapName"] == m for g in games), "wins": sum(g["mapName"] == m and g["winnerAllianceId"] == g["candidateAllianceId"] for g in natural)} for m in sorted({g["mapName"] for g in games})},
        }
    report["arena"] = arena
    report["training"] = {}
    for path in sorted((RUN / "experiments").glob("*/metrics.json")):
        m = json.loads(path.read_text(encoding="utf-8"))
        history = m.get("history", [])
        ledger = list(path.parent.glob("*.optimizer_update_ledger.jsonl"))
        updates = sum(1 for p in ledger for _ in rows(p))
        report["training"][path.parent.name] = {
            "updatesInLedger": updates, "updatesInMetrics": m["optimizerUpdates"],
            "trainRows": m["train_samples"], "valRows": m["val_samples"],
            "bestValAccuracy": m["best_val_acc"], "bestEpoch": m["best_epoch"],
            "lastEpoch": {k: history[-1].get(k) for k in ("epoch", "train_acc", "val_acc", "train_loss", "val_loss")},
            "lossMode": m["loss_mode"], "valueWeight": m["value_weight"],
            "seed": m["seed"], "seeds": m.get("seeds"),
            "globalPolicyPool": m["global_policy_pool"],
            "dataset": m["dataset"],
        }
    data = {}
    val_info, val_keys = scan_data(RUN / "experiments/_data/B01_val_fixed.jsonl")
    data["fixedValidation"] = val_info
    for name in ("B0", "B1", "B1e", "B2"):
        info, keys = scan_data(RUN / f"data/{name}_train.jsonl")
        info["fixedValidationInputOverlap"] = len(keys & val_keys)
        data[name] = info
    # 抽查真正输入 trainer 的验证分区，避免只审核准备阶段的文件。
    data["actualTrainerValidationFirstRow"] = {}
    for name in ("B1", "B1e", "B0h_beh"):
        for row in rows(RUN / f"experiments/_data/{name}_trainval.jsonl"):
            if row.get("partition") == "val":
                data["actualTrainerValidationFirstRow"][name] = {
                    k: row.get(k) for k in ("sampleId", "sourcePolicy", "targetActionCode", "targetSource", "l1ActionCode", "behaviorActionCode", "teacherActionCode")
                }
                break
    report["data"] = data
    champion = REPO / "v16/out/v16_20260926_core/experiments/P1/s2026/P1_final.json"
    champion_json = json.loads(champion.read_text(encoding="utf-8"))
    report["championSha256"] = sha(champion)
    report["bundledModels"] = {}
    for path in sorted((REPO / "src/game/ai/models").glob("spatial*checkpoint.json")):
        model = json.loads(path.read_text(encoding="utf-8"))
        report["bundledModels"][path.name] = {
            "sha256": sha(path), "sameJsonAsChampion": model == champion_json,
            "schema": model.get("encoderSchemaId"), "version": model.get("version"),
        }
    report["confirmFiles"] = [str(p.relative_to(REPO)) for p in (RUN / "arena/confirm").glob("*.games.jsonl")]
    out = Path(__file__).with_name("v17_independent_audit_20260927.json")
    out.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"output": str(out), "arena": {k: f"{v['wins']}/{v['games']}" for k,v in arena.items()}, "data": data, "bundledModels": report["bundledModels"]}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
