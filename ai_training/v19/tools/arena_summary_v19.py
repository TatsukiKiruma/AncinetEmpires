"""V19 对局面板汇总：从逐局 games.jsonl 重算胜场，不接受任何人工填写的成绩。

口径（与 V18 复核 §1 一致，便于纵向比较）：
- 自然胜只认 `outcomeKind == NATURAL_WIN`；`STEP_LIMIT` / `PLY_LIMIT` / `WALL_TIMEOUT`
  等截断一律不计为胜，也不从分母删除。
- 逐图、逐座位分解；fallback/error 单列，非零即失败。
- 若提供 `--compare`，按 (mapName, rootSeed, candidateSeat) 对齐逐局结果，给出配对差异。

用法：
    python v19/tools/arena_summary_v19.py --run-id run_20260928_v19_01 --panel dev --names A,B
"""
from __future__ import annotations

import argparse
import hashlib
import json
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def load_rows(out_dir: Path, name: str) -> list[dict]:
    rows: list[dict] = []
    for shard in range(5):
        path = out_dir / f"{name}.m{shard}.games.jsonl"
        if not path.is_file():
            continue
        for line in path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line:
                rows.append(json.loads(line))
    return rows


def summarize(name: str, rows: list[dict]) -> dict:
    outcomes = Counter(r.get("outcomeKind") for r in rows)
    by_map: dict[str, Counter] = defaultdict(Counter)
    by_seat: dict[str, Counter] = defaultdict(Counter)
    for r in rows:
        by_map[r.get("mapName")][r.get("outcomeKind")] += 1
        by_seat[str(r.get("candidateSeat"))][r.get("outcomeKind")] += 1
    wins = outcomes.get("NATURAL_WIN", 0)
    games = len(rows)
    return {
        "name": name,
        "games": games,
        "wins": wins,
        "losses": outcomes.get("NATURAL_LOSS", 0),
        "draws": outcomes.get("NATURAL_DRAW", 0),
        "truncated": sum(v for k, v in outcomes.items()
                         if k in ("STEP_LIMIT", "PLY_LIMIT", "WALL_TIMEOUT", "CANCELLED")),
        "outcomes": dict(outcomes),
        "byMap": {k: dict(v) for k, v in sorted(by_map.items())},
        "byMapWins": {k: v.get("NATURAL_WIN", 0) for k, v in sorted(by_map.items())},
        "bySeat": {k: dict(v) for k, v in sorted(by_seat.items())},
        "fallbacks": sum(1 for r in rows if r.get("fallbackUsed")),
        "errors": sum(1 for r in rows if r.get("error")),
        "checkpointSha256": sorted({r.get("checkpointSha256") for r in rows if r.get("checkpointSha256")}),
        "encoderSchema": sorted({r.get("encoderSchema") for r in rows if r.get("encoderSchema")}),
        "uniqueGameIds": len({r.get("gameId") for r in rows}),
        "sumTransitions": sum(int(r.get("engineTransitions") or 0) for r in rows),
        "sumWallHours": round(sum(float(r.get("wallMs") or 0) for r in rows) / 3_600_000.0, 4),
        "candidateDecisions": sum(int(r.get("candidateDecisions") or 0) for r in rows),
    }


def pair_diff(a_rows: list[dict], b_rows: list[dict]) -> dict:
    key = lambda r: (r.get("mapName"), r.get("rootSeed"), r.get("candidateSeat"))
    a = {key(r): r for r in a_rows}
    b = {key(r): r for r in b_rows}
    common = sorted(set(a) & set(b), key=lambda t: (str(t[0]), t[1] or 0, t[2] if t[2] is not None else -1))
    win = lambda r: 1 if r.get("outcomeKind") == "NATURAL_WIN" else 0
    diffs = []
    for k in common:
        diffs.append({
            "mapName": k[0], "rootSeed": k[1], "seat": k[2],
            "a": a[k].get("outcomeKind"), "b": b[k].get("outcomeKind"),
            "delta": win(a[k]) - win(b[k]),
        })
    return {
        "commonGames": len(common),
        "deltaWins": sum(d["delta"] for d in diffs),
        "identicalOutcomes": sum(1 for d in diffs if d["a"] == d["b"]),
        "perGame": diffs,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--run-id", default="run_20260928_v19_01")
    parser.add_argument("--panel", default="dev")
    parser.add_argument("--names", required=True, help="逗号分隔的模型键（输出文件名前缀）")
    parser.add_argument("--compare", default=None, help="与哪个 name 做逐局配对比较")
    args = parser.parse_args()

    run_root = ROOT / "v19" / "out" / args.run_id
    out_dir = run_root / "arena" / args.panel
    if not out_dir.is_dir():
        raise SystemExit(f"面板目录不存在：{out_dir}")

    summaries = {}
    raw = {}
    for name in [n.strip() for n in args.names.split(",") if n.strip()]:
        rows = load_rows(out_dir, name)
        if not rows:
            raise SystemExit(f"{name}: 没有找到任何逐局行（拒绝用空结果当成绩）。")
        raw[name] = rows
        summaries[name] = summarize(name, rows)

    payload = {
        "schema": "v19_arena_summary_1",
        "runId": args.run_id,
        "panel": args.panel,
        "panelDir": str(out_dir.relative_to(ROOT)).replace("\\", "/"),
        "note": "胜场由逐局文件重算；截断不计为胜，也不从分母删除。",
        "models": summaries,
    }
    if args.compare and args.compare in raw:
        base = args.compare
        payload["pairedVs"] = {
            base: {name: pair_diff(raw[name], raw[base]) for name in raw if name != base}
        }

    out_path = out_dir / f"{'_'.join(summaries.keys())}.summary.v19.json"
    out_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    for name, s in summaries.items():
        print(f"[{name}] wins={s['wins']}/{s['games']} losses={s['losses']} draws={s['draws']} "
              f"truncated={s['truncated']} fallbacks={s['fallbacks']} errors={s['errors']} "
              f"byMapWins={json.dumps(s['byMapWins'], ensure_ascii=False)}")
    if "pairedVs" in payload:
        for base, per in payload["pairedVs"].items():
            for name, d in per.items():
                print(f"[paired {name} vs {base}] common={d['commonGames']} deltaWins={d['deltaWins']} "
                      f"identicalOutcomes={d['identicalOutcomes']}")
    print(f"[summary] -> {out_path.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
