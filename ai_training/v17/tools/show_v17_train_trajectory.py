"""V17：打印指定训练臂的逐 epoch 轨迹（train/val 准确率与损失），用于判断欠拟合还是过拟合。"""

from __future__ import annotations

import json
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ARMS = sys.argv[1:] or ["B0", "B0_16k", "B1e"]

for arm in ARMS:
    p = REPO / "v17" / "out" / "v17_20260926_r2" / "experiments" / arm / "metrics.json"
    if not p.exists():
        print(f"[{arm}] missing metrics.json")
        continue
    d = json.loads(p.read_text(encoding="utf-8"))
    hist = d.get("history") or []
    print(f"== {arm}: updates={d.get('optimizerUpdates')} epochs={d.get('epochsCompleted')} "
          f"stop={d.get('lifecycle', {}).get('stopReason')} bestVal={d.get('best_val_acc')} @ep{d.get('best_epoch')} "
          f"train={d.get('train_samples')} val={d.get('val_samples')}")
    header = f"{'ep':>4s} {'updates':>8s} {'trainAcc':>9s} {'valAcc':>8s} {'trainLoss':>10s} {'valLoss':>9s}"
    print("   " + header)
    for e in hist:
        print("   " + f"{e['epoch']:>4} {e['updatesCumulative']:>8} {e['train_acc']:>9.4f} "
              f"{e['val_acc']:>8.4f} {e['train_loss']:>10.4f} {e['val_loss']:>9.4f}")
    print()
