"""三臂闭合后生成及复核证据清单；不包含可变运行缓存。"""
import argparse
import hashlib
import json
import os
from pathlib import Path

HERE = Path(__file__).resolve().parent
ARTIFACTS = Path('D:/AncientEmpiresData/continuation_stage2_20261030_v1')


def sha(path):
    with Path(path).open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def build():
    comparison = json.loads((HERE / 'TRIAL_COMPARISON.json').read_text('utf-8'))
    assert comparison['experimentsComplete'] and len(comparison['arms']) == 3
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
                # 所有历史同名清单及请求保留，但避免形成递归摘要依赖。
                if root == HERE and name in {'EVIDENCE_MANIFEST.json', 'REVIEW_REQUEST.json'}:
                    continue
                path = Path(current) / name
                rows.append(dict(path=path.as_posix(), bytes=path.stat().st_size, sha256=sha(path)))
    for relative in ['stage1/SCIENCE_CONTRACT.json', 'stage1/RUNNER_CONTRACT.json', 'stage1/SOURCE_MANIFEST.json',
                     'STAGE2_DISPATCH.json', 'reviews/stage2-review-5.json']:
        path = HERE.parent / relative
        rows.append(dict(path=path.as_posix(), bytes=path.stat().st_size, sha256=sha(path)))
    all_updates = sum(arm['updates'] for arm in comparison['arms'])
    manifest = dict(schema='continuation-stage2-evidence-manifest-v1', entries=rows, count=len(rows),
                    bytes=sum(row['bytes'] for row in rows), runtimeCachesPreservedButNotHashed=caches,
                    allFormalUpdates=all_updates, allFormalAtomicExposures=sum(arm['samples'] for arm in comparison['arms']),
                    additionalFormalUpdatesAfterV4Approval=all_updates - 7758,
                    additionalFormalAtomicExposuresAfterV4Approval=sum(arm['samples'] for arm in comparison['arms']) - 62064,
                    isolatedEngineeringForwardSamples=8, engineeringOptimizerUpdatesThisV4Smoke=0,
                    allHistoricalSyntheticControlUpdates=208, finalTestPredictions=0,
                    candidateArenaGames=120, reusedBaselineArenaGames=40)
    path = HERE / 'EVIDENCE_MANIFEST.json'
    path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', 'utf-8')
    return manifest


def verify():
    manifest = json.loads((HERE / 'EVIDENCE_MANIFEST.json').read_text('utf-8'))
    failures = []
    for row in manifest['entries']:
        path = Path(row['path'])
        if not path.is_file() or path.stat().st_size != row['bytes'] or sha(path) != row['sha256']:
            failures.append(row['path'])
    assert not failures, failures
    assert len(manifest['entries']) == manifest['count']
    return manifest


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--verify-only', action='store_true')
    args = parser.parse_args()
    result = verify() if args.verify_only else build()
    print(json.dumps(dict(entries=result['count'], bytes=result['bytes'], verification=args.verify_only)))
