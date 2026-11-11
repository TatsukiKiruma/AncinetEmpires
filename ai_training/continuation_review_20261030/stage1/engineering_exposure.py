"""复现工程连续4步使用的32条请求，记录实际编码来源与阶段，无更新。"""
import json
from collections import Counter
from runtime import HERE, Sampler, Encoder, save

manifest = json.loads((HERE / 'PARTITIONS.json').read_text('utf-8'))
config = json.loads((HERE / 'STAGE2_CONFIG.json').read_text('utf-8'))
sampler = Sampler(manifest, config['seed'], config['newRatio'], config['duelRatio'])
encoder = Encoder(HERE / 'exposure-encoder.stderr.log')
rows, requests = [], []
try:
    for _ in range(4):
        batch = sampler.batch()
        requests.extend(batch)
        rows.extend(encoder.rows(batch))
finally:
    encoder.close()
counts = Counter()
for row in rows:
    s = row['source']
    for key in [f'corpus/{s["corpus"]}', f'players/{s["players"]}', f'source/{s["source"]}', f'actual-phase/{s["corpus"]}/{s["phase"]}', f'cell/{s["corpus"]}/{s["players"]}/{s["category"]}']:
        counts[key] += 1
save(HERE / 'ENGINEERING_EXPOSURE.json', dict(samples=32, requests=requests, actualCounts=dict(counts), actualSources=[r['source'] for r in rows], optimizerUpdates=0, sourceNote='这些是连续工程4步实际使用的确定性请求的重编码，不是额外训练暴露'))
