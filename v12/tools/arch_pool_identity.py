"""Are `spatial_v2_full_pool.jsonl` and `baseline_dataset.jsonl` the SAME samples?

Both report 48,714 rows; if they are the same underlying decision samples then the
spatial pipeline's `valueTarget` and the baseline's `label.actionCode` can be joined
row-for-row, which is what makes Section B and Section C statements about one
corpus rather than two.

Compares the per-episode row counts measured independently by
`arch_value_ceiling.py` (keyed on the pool's own `rootFamilyId`) and
`arch_imitation_mix.py` (keyed on `scenario.id#seed#source.episodeIndex`).

Usage: py -3.12 v12/tools/arch_pool_identity.py
"""
from __future__ import annotations

import json

B = "v12/out/archive_value/value_ceiling.json"
C = "v12/out/archive_value/imitation_mix.json"


def main() -> int:
    b = json.load(open(B, encoding="utf-8"))
    c = json.load(open(C, encoding="utf-8"))
    sb = b["B12_root_rows_full"]
    sc = c["C6_episode_rows_full"]

    kb, kc = set(sb), set(sc)
    print(f"spatial pool  : rows={b['B1_valueTarget_distribution']['n_rows']} "
          f"episodes={len(kb)} sum(rows)={sum(sb.values())}")
    print(f"baseline      : rows={c['source']['rows_read']} "
          f"episodes={len(kc)} sum(rows)={sum(sc.values())}")
    print()
    print(f"identical episode-key sets : {kb == kc}")
    print(f"only in spatial            : {len(kb - kc)}")
    print(f"only in baseline           : {len(kc - kb)}")
    for k in sorted(kb - kc)[:10]:
        print(f"   spatial-only: {k}  rows={sb[k]}")
    for k in sorted(kc - kb)[:10]:
        print(f"   baseline-only: {k}  rows={sc[k]}")
    common = kb & kc
    mismatched = sorted(k for k in common if sb[k] != sc[k])
    print(f"common episodes            : {len(common)}")
    print(f"episodes with DIFFERENT row counts: {len(mismatched)}")
    for k in mismatched[:10]:
        print(f"   {k}  spatial={sb[k]} baseline={sc[k]}")
    print()
    print("VERDICT: " + ("per-episode row counts agree exactly across all shared "
                         "episodes -- consistent with (but not proof of) the two files "
                         "holding the same samples"
                         if not mismatched else
                         "the two files hold DIFFERENT numbers of rows for some episodes"))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
