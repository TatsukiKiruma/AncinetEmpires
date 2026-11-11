#!/usr/bin/env python3
"""V13/T13-04: are the candidate labels even DISTINGUISHABLE from each other?

If several candidates within one state encode to the same feature vector, then a
single-label cross-entropy target is partly unlearnable: two different indices carry
identical inputs and only one is the label. This is the "unidentifiable actions" check
the taskbook asks for, and it must be reported before blaming the optimiser or the
architecture for a low accuracy.

Measured on the v3.1 (engine-ordered) B0 subset. The candidate feature key is the tuple
the network actually receives: actorCoord, landingCoord, targetCoord and the 32-value
semantics vector.

Usage:
    py v13/tools/candidate_collision.py --pool v13/out/<runId>/T13-07/data_v3_b0_v31/pool_v31_subset.jsonl
"""
from __future__ import annotations

import argparse
import hashlib
import json
from collections import Counter
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]


def key_of(c: dict) -> str:
    def coord(cd):
        if not cd:
            return "-"
        return f"{cd.get('x')},{cd.get('y')}"
    sem = ",".join(f"{v:.4f}" for v in c.get("semantics", []))
    return f"{coord(c.get('actorCoord'))}|{coord(c.get('landingCoord'))}|{coord(c.get('targetCoord'))}|{sem}"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--pool", required=True)
    ap.add_argument("--out", default=None)
    args = ap.parse_args()

    pool = REPO_ROOT / args.pool
    out_path = REPO_ROOT / args.out if args.out else pool.parent / "candidate_collision.json"

    states = 0
    states_with_collision = 0
    total_candidates = 0
    total_duplicate_candidates = 0
    label_collides_with_another = 0
    label_is_unique = 0
    max_group = 0
    worst_examples = []

    with pool.open("r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            row = json.loads(line)
            cands = row["candidateActions"]
            states += 1
            total_candidates += len(cands)
            counts = Counter(key_of(c) for c in cands)
            dupes = sum(n - 1 for n in counts.values() if n > 1)
            total_duplicate_candidates += dupes
            if dupes:
                states_with_collision += 1
                biggest = max(counts.values())
                if biggest > max_group:
                    max_group = biggest
                    if len(worst_examples) < 5:
                        worst_examples.append({
                            "sampleId": row["sampleId"],
                            "candidateCount": len(cands),
                            "distinctFeatureVectors": len(counts),
                            "largestIdenticalGroup": biggest,
                        })
            tgt = key_of(cands[row["targetActionIndex"]])
            if counts[tgt] > 1:
                label_collides_with_another += 1
            else:
                label_is_unique += 1

    report = {
        "schema": "v13_candidate_collision_1",
        "pool": str(pool.relative_to(REPO_ROOT)),
        "poolSha256": hashlib.sha256(pool.read_bytes()).hexdigest(),
        "states": states,
        "totalCandidates": total_candidates,
        "meanCandidatesPerState": round(total_candidates / max(1, states), 3),
        "statesWithAnyIdenticalFeatureVector": states_with_collision,
        "fractionStatesWithCollision": round(states_with_collision / max(1, states), 6),
        "duplicateCandidatesTotal": total_duplicate_candidates,
        "duplicateCandidateFraction": round(total_duplicate_candidates / max(1, total_candidates), 6),
        "labelRows": {
            "labelFeatureVectorIsUniqueInItsState": label_is_unique,
            "labelFeatureVectorMatchesAtLeastOneOtherCandidate": label_collides_with_another,
            "labelCollisionFraction": round(label_collides_with_another / max(1, states), 6),
        },
        "largestIdenticalGroupObserved": max_group,
        "examples": worst_examples,
        "interpretation": (
            "A row whose label shares its exact feature vector with another candidate cannot "
            "be fitted by a single-label objective, because the network sees identical inputs "
            "for two different indices. Any accuracy ceiling must be reported together with "
            "this number."
        ),
    }
    out_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(f"[collision] states={states} candidates={total_candidates} "
          f"dupCandidates={total_duplicate_candidates} ({report['duplicateCandidateFraction']})")
    print(f"[collision] label collides with another candidate in "
          f"{label_collides_with_another}/{states} = {report['labelRows']['labelCollisionFraction']} rows")
    print(f"[collision] largest identical group = {max_group}")
    print(f"[collision] wrote {out_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
