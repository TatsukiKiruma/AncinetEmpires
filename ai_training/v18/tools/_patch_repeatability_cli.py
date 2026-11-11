"""让可重复性检验可以指向任意成对续弈产物（S1 用同一套判据，保证可比）。

中文：S1 只改续弈预算，判据必须**逐字相同**才有可比性。因此不复制一份脚本，
而是给 `analyze_preference_repeatability.py` 加一个 `--branches` 参数。
"""
import io
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
TARGET = ROOT / "v18" / "tools" / "analyze_preference_repeatability.py"

OLD_ARG = """    parser.add_argument("--run-id", default="run_20260927_v18_01")
    args = parser.parse_args()
    run = ROOT / "v18" / "out" / args.run_id
    branches_path = run / "counterfactual" / "paired_continuation.branches.jsonl\""""

NEW_ARG = """    parser.add_argument("--run-id", default="run_20260927_v18_01")
    parser.add_argument(
        "--branches",
        default=None,
        help="成对续弈产物路径；缺省用 S0 的 paired_continuation.branches.jsonl。"
             "S1/S2 必须用同一个判据，只换输入文件。",
    )
    parser.add_argument("--out-name", default="preference_repeatability.json")
    args = parser.parse_args()
    run = ROOT / "v18" / "out" / args.run_id
    branches_path = Path(args.branches) if args.branches else run / "counterfactual" / "paired_continuation.branches.jsonl\""""

OLD_OUT = """    out = run / "counterfactual" / "preference_repeatability.json\""""
NEW_OUT = """    out = run / "counterfactual" / args.out_name"""

OLD_PAIRS = """    with (run / "counterfactual" / "preference_pairs.jsonl").open("w", encoding="utf-8") as sink:"""
NEW_PAIRS = """    pairs_name = args.out_name.replace(".json", ".pairs.jsonl")
    with (run / "counterfactual" / pairs_name).open("w", encoding="utf-8") as sink:"""

OLD_SRC = """        "source": str(branches_path.relative_to(ROOT)).replace("\\\\", "/"),"""
NEW_SRC = """        "source": str(branches_path.relative_to(ROOT)).replace("\\\\", "/") if branches_path.is_absolute() else str(branches_path),"""


def main() -> int:
    text = io.open(TARGET, encoding="utf-8").read()
    changed = 0
    for old, new in ((OLD_ARG, NEW_ARG), (OLD_OUT, NEW_OUT), (OLD_PAIRS, NEW_PAIRS), (OLD_SRC, NEW_SRC)):
        if new in text:
            continue
        if old not in text:
            print(f"ERROR: anchor not found: {old[:70]!r}", file=sys.stderr)
            return 2
        text = text.replace(old, new, 1)
        changed += 1
    io.open(TARGET, "w", encoding="utf-8").write(text)
    print(f"applied {changed} patches")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
