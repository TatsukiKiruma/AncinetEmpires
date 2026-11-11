"""V19：对两个 DEV20 面板做逐局配对比较（按 map × rootSeed × seat 对齐）。

只读逐局文件重算，不重新跑对局。用于回答「这一波相对上一波/冠军到底变了哪几局」。

用法：
    python v19/tools/paired_dev_compare.py --run-id <runId> --a <候选名> --b <对照名> \
        [--a-dir v19/out/<runId>/arena/dev] [--b-dir ...]
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def load(out_dir: Path, name: str) -> list[dict]:
    rows: list[dict] = []
    for shard in range(5):
        path = out_dir / f"{name}.m{shard}.games.jsonl"
        if path.is_file():
            rows += [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]
    return rows


def key(row: dict):
    return (row.get("mapName"), row.get("rootSeed"), row.get("candidateSeat"))


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--a-dir", required=True)
    parser.add_argument("--a", required=True)
    parser.add_argument("--b-dir", required=True)
    parser.add_argument("--b", required=True)
    parser.add_argument("--out", default=None)
    args = parser.parse_args()

    a_rows = load(ROOT / args.a_dir, args.a)
    b_rows = load(ROOT / args.b_dir, args.b)
    if not a_rows or not b_rows:
        raise SystemExit(f"缺少逐局文件：a={len(a_rows)} b={len(b_rows)}")

    A = {key(r): r for r in a_rows}
    B = {key(r): r for r in b_rows}
    common = sorted(set(A) & set(B),
                    key=lambda t: (str(t[0]), t[1] or 0, t[2] if t[2] is not None else -1))
    win = lambda r: 1 if r.get("outcomeKind") == "NATURAL_WIN" else 0
    diffs = []
    for c in common:
        if A[c].get("outcomeKind") != B[c].get("outcomeKind"):
            diffs.append({
                "mapName": c[0], "rootSeed": c[1], "seat": c[2],
                f"{args.b}": B[c].get("outcomeKind"), f"{args.a}": A[c].get("outcomeKind"),
                "deltaWins": win(A[c]) - win(B[c]),
            })
    report = {
        "a": args.a, "b": args.b,
        "aGames": len(a_rows), "bGames": len(b_rows), "commonGames": len(common),
        "aWins": sum(win(r) for r in a_rows), "bWins": sum(win(r) for r in b_rows),
        "deltaWinsOnCommon": sum(d["deltaWins"] for d in diffs),
        "identicalOutcomes": len(common) - len(diffs),
        "differences": diffs,
        "note": "配对按 (地图, rootSeed, 座位) 对齐；截断与自然终局按 outcomeKind 区分，不合并。",
    }
    print(f"{args.a} wins={report['aWins']}/{report['aGames']}  "
          f"{args.b} wins={report['bWins']}/{report['bGames']}  "
          f"common={report['commonGames']} deltaWins={report['deltaWinsOnCommon']} "
          f"identical={report['identicalOutcomes']}")
    for d in diffs:
        print(f"  DIFF {d['mapName']} seed={d['rootSeed']} seat={d['seat']}: "
              f"{args.b}={d[args.b]} -> {args.a}={d[args.a]}")
    if args.out:
        Path(args.out).write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"[paired] -> {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
