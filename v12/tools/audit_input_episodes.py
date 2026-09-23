"""F09 corroboration: how many real episodes do the converter inputs actually contain?

The spatial dataset's sampleId embeds `source.episodeIndex`, but if that field is
missing on some records the converter substitutes 0, which would make a low
distinct-count an artifact. This probe reads the RAW converter inputs and counts
distinct (scenario.id, seed, episodeIndex) episode keys, plus missing-field rates.

Usage: py -3.12 v12/tools/audit_input_episodes.py
"""
from __future__ import annotations

import json
from collections import Counter

BASE = "training_runs/agent_upgrade_20260919_01/baseline_dataset"
FILES = [
    "dataset_part_pvp.jsonl",
    "dataset_part_00.jsonl",
    "dataset_part_01.jsonl",
    "dataset_part_02.jsonl",
    "dataset_part_03.jsonl",
    "dataset_part_04.jsonl",
    "dataset_part_05.jsonl",
    "dataset_part_08.jsonl",
    "baseline_dataset.jsonl",
]


def scan(name: str, max_lines: int | None = None) -> dict:
    path = f"{BASE}/{name}"
    total = 0
    no_src = 0
    no_ep = 0
    steps = 0
    keys: set[str] = set()
    per_file_ep: Counter[int] = Counter()
    with open(path, "r", encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            total += 1
            o = json.loads(line)
            src = o.get("source")
            if not isinstance(src, dict):
                no_src += 1
                continue
            ep = src.get("episodeIndex")
            if ep is None:
                no_ep += 1
            sc = o.get("scenario") or {}
            keys.add(f"{sc.get('id')}|{o.get('seed')}|{ep}")
            per_file_ep[ep] += 1
            steps += 1
            if max_lines and total >= max_lines:
                break
    return {
        "file": name,
        "records": total,
        "distinct_episode_keys": len(keys),
        "missing_source": no_src,
        "missing_episodeIndex": no_ep,
        "total_steps": steps,
        "top_episode_sizes": per_file_ep.most_common(5),
    }


def main() -> int:
    grand_records = 0
    grand_keys: set[str] = set()
    for name in FILES:
        import os

        if not os.path.exists(f"{BASE}/{name}"):
            print(f"{name:<28} MISSING")
            continue
        r = scan(name)
        grand_records += r["records"]
        print(
            f"{r['file']:<28} records={r['records']:<7} distinct_episode_keys={r['distinct_episode_keys']:<6} "
            f"missing_source={r['missing_source']:<6} missing_episodeIndex={r['missing_episodeIndex']:<6} "
            f"top5={r['top_episode_sizes']}"
        )
    print()
    print(f"total records scanned      : {grand_records}")
    print("NOTE: distinct_episode_keys is summed per file; cross-file key collision is possible")
    print("      because episodeIndex restarts per input file.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
