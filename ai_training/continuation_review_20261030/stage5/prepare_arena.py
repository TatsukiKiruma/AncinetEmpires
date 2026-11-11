"""在Stage5内适配已验证的V7实战工具，不修改历史源文件。"""
import hashlib
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
OLD = HERE.parent / 'stage4_v7'
arena = (OLD / 'arena.ts').read_text(encoding='utf-8')
for before, after in [('./bounded_writer', './arena_writer'), ('./inference_client', './arena_client'), ('./inference_transport', '../stage4_v7/inference_transport'), ('./runtime_identity', '../stage4_v7/runtime_identity'), ("from './io'", "from './arena_io'")]:
    arena = arena.replace(before, after)
with (HERE / 'arena.ts').open('x', encoding='utf-8') as f: f.write(arena)
client = (OLD / 'inference_client.ts').read_text(encoding='utf-8').replace("from './io'", "from './arena_io'").replace("from './inference_transport'", "from '../stage4_v7/inference_transport'").replace("path.join(HERE, 'infer.py')", "path.join(HERE, '../stage4_v7/infer.py')")
with (HERE / 'arena_client.ts').open('x', encoding='utf-8') as f: f.write(client)
base = json.loads((OLD / 'config-C2.json').read_text())
data = Path('D:/AncientEmpiresData/continuation_stage5_20261104_v1')
for index in (1, 2, 3):
    prefix = data / f'heads-v1/H{index}/final' if index < 3 else Path('D:/AncientEmpiresData/continuation_stage3_20261030_v1/acceptance_mac100k_20261031_v1/best/final')
    config = {**base, 'modelPrefix': str(prefix), 'modelVersion': hashlib.sha256(prefix.with_suffix('.bin').read_bytes()).hexdigest()}
    if index == 3: config['valueCalibration'] = json.loads((data / 'H3-v1/calibration.json').read_text())
    with (HERE / f'config-C{index}.json').open('x', encoding='utf-8') as f: json.dump(config, f, indent=2)
with (HERE / 'DEV_SUBSET.json').open('x', encoding='utf-8') as f: f.write((OLD / 'DEV_SUBSET.json').read_text())
