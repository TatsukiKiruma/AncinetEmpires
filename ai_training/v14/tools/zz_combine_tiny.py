import json, pathlib
run = pathlib.Path("v14/out/v14_20260924_t14")
tiny = (run/"T14-04/tiny_fit_dataset.jsonl").read_text(encoding="utf-8")
val = (run/"T14-04/val_placeholder.jsonl").read_text(encoding="utf-8")
# 训练器只接受单个 --dataset 文件，因此把 128 个训练状态 + 8 行 val 占位合并成一个文件。
(run/"T14-04/tiny_fit_with_val.jsonl").write_text(tiny + val, encoding="utf-8")
rows = [json.loads(l) for l in (tiny+val).splitlines() if l.strip()]
print("combined rows:", len(rows), "roots:", len({r["rootFamilyId"] for r in rows}))
