"""生成本轮已存产物摘要和真实LR记录，不训练、不评测、不覆盖原始证据。"""
import csv
import hashlib
import json
import os
from pathlib import Path

HERE = Path(__file__).resolve().parent
STAGE1 = HERE.parent / 'stage1'
ARTIFACTS = Path('D:/AncientEmpiresData/continuation_stage2_20261030_v1')


def sha(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


metrics = [json.loads(line) for line in (ARTIFACTS / 'lr-1e-4/METRICS.jsonl').read_text('utf-8').splitlines() if line]
with (HERE / 'LR_CURVE.csv').open('w', encoding='utf-8-sig', newline='') as stream:
    writer = csv.writer(stream)
    writer.writerow(['已记录更新', '样本', '累计秒', '实际使用LR', '下次LR', '损失', '裁剪前梯度范数'])
    for row in metrics:
        writer.writerow([row[k] for k in ['stageUpdates', 'samples', 'wallSeconds', 'learningRateUsed', 'nextLearningRate', 'loss', 'gradientNorm']])

for point in [2500, 5000, 7500]:
    report = json.loads((ARTIFACTS / f'lr-1e-4/dev-{point}/RESULT.json').read_text('utf-8'))
    assert report['modelSha256'] == sha(ARTIFACTS / f'lr-1e-4/dev-model-{point}.bin')
    assert report['samples'] == report['plannedSamples'] == 1299 and not report['finalTestEvaluated']

entries = []
for root, excluded in [(HERE, {'__pycache__'}), (ARTIFACTS, {'miopen-db', 'miopen-cache'})]:
    for current, directories, files in os.walk(root):
        directories[:] = [name for name in directories if name not in excluded]
        for name in sorted(files):
            if root == HERE and name in {'EVIDENCE_MANIFEST.json', 'REVIEW_REQUEST.json'}:
                continue
            path = Path(current) / name
            entries.append(dict(path=path.as_posix(), bytes=path.stat().st_size, sha256=sha(path)))
for path in [STAGE1 / name for name in ['SCIENCE_CONTRACT.json', 'RUNNER_CONTRACT.json', 'SOURCE_MANIFEST.json']]:
    entries.append(dict(path=path.as_posix(), bytes=path.stat().st_size, sha256=sha(path)))
report = dict(schema='continuation-stage2-evidence-manifest-v1', entries=entries, count=len(entries),
              bytes=sum(e['bytes'] for e in entries), runtimeCachesPreservedButNotHashed=True,
              sealedTestPredictions=0, additionalForwardCalls=0, optimizerUpdates=0)
(HERE / 'EVIDENCE_MANIFEST.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), 'utf-8')
print(json.dumps(dict(files=report['count'], bytes=report['bytes'], lrRows=len(metrics))))
