"""Probe the action-code vocabulary in the baseline dataset (needed for Section C).

Reads only the first 4000 lines: enough to enumerate action types and confirm
that every key Section C extracts occurs at most once per line.

Usage: py -3.12 v12/tools/arch_probe3.py
"""
from __future__ import annotations

import collections
import re

BASELINE = "training_runs/agent_upgrade_20260919_01/baseline_dataset/baseline_dataset.jsonl"

RE_ACTIONCODE = re.compile(r'"actionCode":"([^"]*)"')
RE_POLICY = re.compile(r'"policy":"([^"]*)"')
RE_ROOT = re.compile(r'"scenario":\{"id":"([^"]+)"\},"seed":(\d+)')
RE_EPIDX = re.compile(r'"source":\{[^}]*?"episodeIndex":(\d+)')
RE_LABEL = re.compile(r'"label":\{"fixedActionIndex":\d+,"actionCode":"([^"]*)"')
RE_LEGAL = re.compile(r'"legalActionCodes":\[(.*?)\],"legalActionCount"')


def main() -> int:
    types = collections.Counter()
    type_by_policy: dict[str, collections.Counter] = collections.defaultdict(collections.Counter)
    occ = collections.Counter()
    n = 0
    bad = collections.Counter()
    with open(BASELINE, "r", encoding="utf-8", errors="replace") as fh:
        for i, line in enumerate(fh):
            if i >= 4000:
                break
            n += 1
            occ["actionCode_total"] += len(RE_ACTIONCODE.findall(line))
            occ["policy_total"] += len(RE_POLICY.findall(line))
            lm = RE_LABEL.search(line)
            pm = RE_POLICY.search(line)
            if not lm or not pm:
                bad["missing_label_or_policy"] += 1
                continue
            code = lm.group(1)
            atype = code.split(":", 1)[0]
            types[atype] += 1
            type_by_policy[pm.group(1)][atype] += 1
            if not RE_ROOT.search(line):
                bad["missing_root"] += 1
            if not RE_EPIDX.search(line):
                bad["missing_episodeIndex"] += 1
            if not RE_LEGAL.search(line):
                bad["missing_legal"] += 1

    print(f"lines probed          : {n}")
    print(f"key occurrence totals : {dict(occ)}   (want == lines for both)")
    print(f"extraction misses     : {dict(bad)}")
    print()
    print("chosen-action type distribution (first 4000 lines):")
    tot = sum(types.values())
    for k, v in types.most_common():
        print(f"  {k:<12} {v:>6}  {100.0 * v / tot:6.2f}%")
    print()
    print("by policy:")
    for pol, c in sorted(type_by_policy.items()):
        s = sum(c.values())
        print(f"  {pol} (n={s}): " + " ".join(f"{k}:{v}" for k, v in c.most_common()))
    print()
    # a few example legal-code types
    ex = collections.Counter()
    with open(BASELINE, "r", encoding="utf-8", errors="replace") as fh:
        for i, line in enumerate(fh):
            if i >= 400:
                break
            m = RE_LEGAL.search(line)
            if not m:
                continue
            for code in re.findall(r'"([^"]*)"', m.group(1)):
                ex[code.split(":", 1)[0]] += 1
    print("legal-action type vocabulary (first 400 lines):")
    for k, v in ex.most_common():
        print(f"  {k:<12} {v:>6}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
