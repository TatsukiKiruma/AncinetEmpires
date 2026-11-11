"""记录本次同步候选与工程证据；保留但不散列运行缓存。"""
import hashlib
import json
import os
from pathlib import Path

HERE = Path(__file__).resolve().parent
ARTIFACTS = Path('D:/AncientEmpiresData/continuation_stage2_20261030_v1')


def sha(path):
    with path.open('rb') as file:
        return hashlib.file_digest(file, 'sha256').hexdigest()


if __name__ == '__main__':
    rows, caches = [], []
    for root in [HERE, ARTIFACTS]:
        for current, directories, names in os.walk(root):
            kept = []
            for name in directories:
                if name == '__pycache__':
                    continue
                if name.endswith('miopen-db') or name.endswith('miopen-cache'):
                    caches.append((Path(current) / name).as_posix())
                    continue
                kept.append(name)
            directories[:] = kept
            for name in sorted(names):
                if root == HERE and name in {'EVIDENCE_MANIFEST.json', 'REVIEW_REQUEST.json'}:
                    continue
                path = Path(current) / name
                rows.append(dict(path=path.as_posix(), bytes=path.stat().st_size, sha256=sha(path)))
    for name in ['SCIENCE_CONTRACT.json', 'RUNNER_CONTRACT.json', 'SOURCE_MANIFEST.json']:
        path = HERE.parent / 'stage1' / name
        rows.append(dict(path=path.as_posix(), bytes=path.stat().st_size, sha256=sha(path)))
    manifest = dict(schema='continuation-stage2-evidence-manifest-v1', entries=rows, count=len(rows),
                    bytes=sum(row['bytes'] for row in rows), runtimeCachesPreservedButNotHashed=caches,
                    additionalFormalUpdates=0, additionalEngineeringForwardSamples=8, finalTestPredictions=0)
    (HERE / 'EVIDENCE_MANIFEST.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', 'utf-8')
    print(json.dumps(dict(entries=len(rows), bytes=manifest['bytes'], excludedCaches=len(caches))))
