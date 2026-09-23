"""Diagnostic: materialise a rootFamilyId for the broken 30k dataset.

The converter never wrote episode identity, but sampleId embeds it:
    sampleId = s_<totalSaved>_<episodeIndex>_<step>          (written by
    tools/convert_archive_to_spatial.ts:173)

This streams the dataset and injects
    rootFamilyId = "ep{episodeIndex}"
so the trainer's grouped split (python/train_spatial_resnet.py:480) can actually
group instead of falling back to f"ep_{idx // 60}".

CAVEAT recorded deliberately: episodeIndex restarts inside each converter input
file, and the file name is NOT recoverable from the output, so two different
games that share an episodeIndex in different source files collapse into one
root here. That makes this grouping CONSERVATIVE-good but not exact. Its only
purpose is to measure how much the 60-row fallback inflated validation accuracy.

Read-only with respect to the source dataset; writes a new file.

Usage:
  py -3.12 v12/tools/diag_inject_roots.py <in.jsonl> <out.jsonl>
"""
from __future__ import annotations

import json
import re
import sys

SAMPLE_ID = re.compile(r"^s_(\d+)_(\d+)_(\d+)$")


def main() -> int:
    if len(sys.argv) != 3:
        print(__doc__)
        return 2
    src, dst = sys.argv[1], sys.argv[2]

    n = 0
    bad = 0
    roots: set[str] = set()
    with open(src, "r", encoding="utf-8") as fin, open(dst, "w", encoding="utf-8") as fout:
        for line in fin:
            line = line.strip()
            if not line:
                continue
            o = json.loads(line)
            m = SAMPLE_ID.match(str(o.get("sampleId", "")))
            if m:
                ep = m.group(2)
                o["rootFamilyId"] = f"ep{ep}"
                o["episodeId"] = f"ep{ep}"
                o["step"] = int(m.group(3))
                roots.add(f"ep{ep}")
            else:
                bad += 1
                o["rootFamilyId"] = f"__unparsed_{n}"
                roots.add(f"__unparsed_{n}")
            fout.write(json.dumps(o) + "\n")
            n += 1

    print(f"wrote {n} rows -> {dst}")
    print(f"unparsed sampleIds : {bad}")
    print(f"distinct rootFamilyId injected: {len(roots)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
