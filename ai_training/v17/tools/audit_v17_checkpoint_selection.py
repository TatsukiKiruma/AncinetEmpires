"""V17：列出每个训练臂的 best-val 与 final 的差距。

中文：任务书要求"导出选 best/final 须绑定实测对局身份"。本轮 DEV20 用的是 `*_final.json`
（最后一次更新），但目录里同时存在 `*_best.json`（best-val 选择点）。
如果两者差距大，那么"用 final 打出来的成绩"就不能代表这个配方的最好水平。
本脚本把差距量化，供决定是否补测 best 检查点。
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ARMS = ["V0", "P0", "PV0", "B0", "B1", "B1b", "B1c", "B1d", "B1e", "B1e_m"]


def main() -> int:
    run = REPO / "v17" / "out" / "v17_20260926_r2" / "experiments"
    rows = []
    for arm in ARMS:
        mp = run / arm / "metrics.json"
        if not mp.exists():
            rows.append({"arm": arm, "error": "missing metrics"})
            continue
        d = json.loads(mp.read_text(encoding="utf-8"))
        hist = d.get("history") or []
        best_val = d.get("best_val_acc")
        best_epoch = d.get("best_epoch")
        final_val = hist[-1].get("val_acc") if hist else None
        final_train = hist[-1].get("train_acc") if hist else None
        rows.append({
            "arm": arm,
            "bestValAcc": best_val,
            "bestEpoch": best_epoch,
            "finalValAcc": final_val,
            "finalTrainAcc": final_train,
            "gapBestMinusFinal": (best_val - final_val) if (best_val is not None and final_val is not None) else None,
            "overfitGapTrainMinusValFinal": (final_train - final_val) if (final_train is not None and final_val is not None) else None,
            "bestCheckpointSha256": (d.get("artifacts", {}).get("best") or {}).get("sha256"),
            "finalCheckpointSha256": (d.get("artifacts", {}).get("final") or {}).get("sha256"),
            "measuredInArena": None,  # filled below from the summary files
        })

    # 把已经实际对战的检查点标出来：arena 的 summary 里带 checkpointSha256
    for summary in sorted((run.parent / "arena" / "dev").glob("*.summary.json")):
        data = json.loads(summary.read_text(encoding="utf-8"))
        for _key, value in (data.get("models") or {}).items():
            shas = value.get("checkpointSha256") or []
            for row in rows:
                if row.get("finalCheckpointSha256") in shas:
                    row["measuredInArena"] = f"final ({summary.stem})"
                elif row.get("bestCheckpointSha256") in shas:
                    row["measuredInArena"] = f"best ({summary.stem})"

    out = run / "checkpoint_selection_audit.json"
    out.write_text(json.dumps({
        "schema": "v17_checkpoint_selection_audit_1",
        "note": "DEV20 用的是 *_final.json；*_best.json 是 best-val 选择点，记录差距用来说明是否需要补测。",
        "arms": rows,
    }, ensure_ascii=False, indent=2), encoding="utf-8")

    header = f"{'arm':7s} {'bestVal':>8s} {'ep':>4s} {'finalVal':>9s} {'gap':>7s} {'train-final':>12s} {'arena used':>18s}"
    print(header)
    for r in rows:
        if "error" in r:
            print(f"{r['arm']:7s} {r['error']}")
            continue
        print(f"{r['arm']:7s} {r['bestValAcc']:8.4f} {r['bestEpoch']!s:>4s} {r['finalValAcc']:9.4f} "
              f"{r['gapBestMinusFinal']:7.4f} {r['overfitGapTrainMinusValFinal']:12.4f} {str(r['measuredInArena']):>18s}")
    print(f"\nwrote {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())