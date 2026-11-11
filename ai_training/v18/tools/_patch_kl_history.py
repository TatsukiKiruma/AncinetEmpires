"""把 history 里的 KL 记录改成从 epoch_mask_stats 读（run_epoch 的局部变量在 main() 里不可见）。

可重复执行；anchor 缺失时报错而不是静默跳过。
"""
import io
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
TARGET = ROOT / "v17" / "tools" / "train_v17.py"

OLD = """                    # V18/T18-04：KL 项的真实读数（有 KL 时才非空）。
                    "kl": (
                        {
                            "weight": float(kl_weight),
                            "meanKlCurrentToFrozen": (kl_accum / kl_rows) if kl_rows else None,
                            "rowsWithKl": kl_rows,
                        }
                        if kl_rows
                        else None
                    ),"""

NEW = """                    # V18/T18-04：KL 项的真实读数。run_epoch 的局部变量在 main() 里不可见，
                    # 因此 KL 台账经 epoch_mask_stats 带出（与其它掩码台账同一通道）。
                    "kl": (
                        {
                            "weight": float(epoch_mask_stats.get("klWeight", args.kl_weight)),
                            "meanKlCurrentToFrozen": (
                                epoch_mask_stats["klSum"] / epoch_mask_stats["klRows"]
                            ),
                            "rowsWithKl": epoch_mask_stats["klRows"],
                            "referenceCheckpoint": args.kl_to_frozen,
                        }
                        if epoch_mask_stats.get("klRows")
                        else None
                    ),"""


def main() -> int:
    text = io.open(TARGET, encoding="utf-8").read()
    if NEW in text:
        print("already patched")
        return 0
    if OLD not in text:
        print("ERROR: anchor not found", file=sys.stderr)
        return 2
    io.open(TARGET, "w", encoding="utf-8").write(text.replace(OLD, NEW, 1))
    print("patched")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
