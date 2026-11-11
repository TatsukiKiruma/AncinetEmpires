import json, hashlib, pathlib, collections
run = pathlib.Path("v14/out/v14_20260924_t14")
rows = [json.loads(l) for l in (run/"T14-04/tiny_fit_dataset.jsonl").read_text(encoding="utf-8").splitlines() if l.strip()]
err = json.loads((run/"T14-04/tiny_fit_metrics.json").read_text(encoding="utf-8"))["errors"]
print("failed states:", len(err))
by_id = {r["sampleId"]: r for r in rows}
for e in err:
    r = by_id[e["sampleId"]]
    print(f"  {e['sampleId']} target={e['targetActionCode']} pred={e['predictedActionCode']} cands={e['candidateCount']} margin={e['logitMargin']:.3f} root={r['rootFamilyId']} map={r['mapName']} turn={r.get('sourceStep')}")

def agg(r):
    """同一状态下与标签无关的候选聚合：按动作类型 × 玩家人数 × 金币桶。"""
    codes = r["candidateActionCodes"]
    types = collections.Counter(c.split(":")[0] for c in codes)
    gold = None
    return (r["targetActionCode"].split(":")[0], len(codes), tuple(sorted(types.items())), r.get("playerCount"), r.get("mapName"))

def mask(r):
    """目标为招募动作时的聚合：城堡坐标 + 候选兵种集合。"""
    t = r["targetActionCode"].split(":")
    if t[0] != "recruit_to_castle":
        return None
    castle = t[2]
    classes = sorted({c.split(":")[1] for c in r["candidateActionCodes"] if c.startswith("recruit_to_castle:")})
    gold = None
    return (castle, tuple(classes), r.get("playerCount"))

groups = collections.defaultdict(list)
for r in rows:
    k = mask(r)
    if k: groups[k].append(r)
print("\n招募目标分组（城堡+候选兵种集合+人数）：")
conflicts = 0
for k, items in sorted(groups.items(), key=lambda kv: -len(kv[1]))[:8]:
    labels = collections.Counter(i["targetActionCode"] for i in items)
    mark = "  <-- 冲突" if len(labels) > 1 else ""
    if len(labels) > 1: conflicts += 1
    print(f"  {k}: {len(items)} 个状态, 不同标签 {len(labels)} 种 {dict(list(labels.items())[:4])}{mark}")
print("存在多标签冲突的组数:", conflicts)
