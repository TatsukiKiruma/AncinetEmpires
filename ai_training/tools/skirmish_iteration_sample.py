"""跨全部归档分片均匀抽样，保留原始训练/验证隔离，并验证源文件哈希。"""
import hashlib
import json
import random
from collections import Counter
from pathlib import Path

source = Path('training_runs/server_archive_20260913/dataset')
out = Path('training_runs/iteration_20260918')
out.mkdir(exist_ok=True)
manifest = json.loads((source / 'manifest.json').read_text(encoding='utf-8'))
samples = {'train': [], 'validation': []}
episodes = {'train': set(), 'validation': set()}
histograms = {split: Counter() for split in samples}
for index, shard in enumerate(manifest['shards']):
    split = shard['split']
    count = shard['samples']
    limit = min(count, 80 if split == 'train' else 40)
    selected = {round(i * (count - 1) / max(1, limit - 1)) for i in range(limit)}
    digest = hashlib.sha256()
    actual = 0
    with (source / shard['path']).open('rb') as stream:
        for line in stream:
            digest.update(line)
            if not line.strip():
                continue
            if actual in selected:
                sample = json.loads(line)
                samples[split].append(line)
                episodes[split].add((sample['scenario']['id'], sample['seed']))
                histograms[split][sample['scenario']['id'].split(':')[1]] += 1
            actual += 1
    assert actual == count and digest.hexdigest() == shard['sha256'], shard['path']
    if index % 25 == 0:
        print(f'分片校验与抽样 {index + 1}/{len(manifest["shards"])}', flush=True)
assert not (episodes['train'] & episodes['validation']), '原始分割存在对局泄漏'
for split, lines in samples.items():
    random.Random(20260918).shuffle(lines)
    with (out / f'{split}.jsonl').open('wb') as stream:
        for line in lines:
            stream.write(line)
(out / 'sample-manifest.json').write_text(json.dumps({
    'sourceDatasetId': manifest['datasetId'], 'sourceSha256Verified': True,
    'sampling': '每训练分片至多80条、每验证分片至多40条，按行号等距抽样；固定种子打乱；原始对局分割保持隔离',
    'counts': {k: len(v) for k, v in samples.items()},
    'plans': {k: dict(v) for k, v in histograms.items()},
    'sha256': {k: hashlib.sha256((out / f'{k}.jsonl').read_bytes()).hexdigest() for k in samples},
}, ensure_ascii=False, indent=2), encoding='utf-8')
print({k: len(v) for k, v in samples.items()}, flush=True)
