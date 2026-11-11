import json, pathlib
run = pathlib.Path("v14/out/v14_20260924_t14")
tiny = [json.loads(l) for l in (run/"T14-04/tiny_fit_dataset.jsonl").read_text(encoding="utf-8").splitlines() if l.strip()]
tiny_roots = {r["rootFamilyId"] for r in tiny}
# 选一个样本量最大的训练 root 家族，取 8 行作为“形状占位”的验证集（不参与优化，不用于选 epoch）。
rows = [json.loads(l) for l in (run/"T14-02/dataset_v14.jsonl").read_text(encoding="utf-8").splitlines() if l.strip()]
from collections import Counter
cnt = Counter(r["rootFamilyId"] for r in rows if r["rootFamilyId"] not in tiny_roots)
pick = cnt.most_common(1)[0][0]
val_rows = [r for r in rows if r["rootFamilyId"] == pick]
seen, val = set(), []
for r in val_rows:
    if r["sourceStateKey"] in seen: continue
    seen.add(r["sourceStateKey"]); val.append(r)
    if len(val) >= 8: break
(run/"T14-04/val_placeholder.jsonl").write_text("".join(json.dumps(r, ensure_ascii=False)+"\n" for r in val), encoding="utf-8")
manifest = json.loads((run/"T14-04/tiny_split_manifest.json").read_text(encoding="utf-8"))
manifest["valRootFamilies"] = [pick]
manifest["valSizeNote"] = ("val 是形状占位：8 行来自同一训练 root 家族，仅用于满足训练器的非空检查，"
                           "不参与优化、不用于选择 epoch，也不作为泛化指标。记忆能力以 128 个训练状态上的 final checkpoint 重评为准。")
manifest["valPlaceholderRows"] = len(val)
manifest["valPlaceholderRoot"] = pick
(run/"T14-04/tiny_split_manifest.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False)+"\n", encoding="utf-8")
print("val placeholder rows:", len(val), "root:", pick)
