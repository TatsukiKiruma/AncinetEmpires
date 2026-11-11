"""物化新初始化及冻结来源身份，不执行训练。"""
import hashlib
import json
from pathlib import Path
from train import initial_weights, layout, save

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
PHONE = Path('C:/Users/SHIINA/.codex/visualizations/2026/10/18/01a14c51-a6eb-7493-800e-4df86d9f18d7/phone-ab')
manifest = json.loads((PHONE/'DELIVERY_MANIFEST.json').read_text(encoding='utf-8'))
identities = {}
for name, target in [('original-model.json','baseline.json'),('schema.json','old-schema.json'),('selection.json','selection.json')]:
    data = (PHONE/name).read_bytes()
    digest = hashlib.sha256(data).hexdigest()
    entry = next(e for e in manifest['files'] if e['path'] == name)
    assert digest == entry['sha256']
    identities[str(PHONE/name)] = digest
    output = HERE/target
    if output.exists(): assert output.read_bytes() == data
    else: output.write_bytes(data)
for rel in ['ai_training/sd64x3_phone_20261016/DELIVERY_MANIFEST.json','ai_training/sd64x3_phone_20261016/tactics.ts','ai_training/sd64x3_phone_20261016/spatial.ts','ai_training/sd64x3_phone_20261016/model.ts','ai_training/sd64x3_phone_battles_20261016/DELIVERY_MANIFEST.json','ai_training/sd64x3_replay_analysis_20261017/findings.json']:
    identities[str(ROOT/rel)] = hashlib.sha256((ROOT/rel).read_bytes()).hexdigest()
save('PRESERVE.json',identities)
schema = json.loads((HERE/'schema.json').read_text(encoding='utf-8'))
weights = initial_weights(schema)
assert len(weights) == layout(schema)['count']
save('initial.json',weights)
save('model-initial.json',dict(schema={**schema,'featureMode':'new'},weights=weights,arm='initial',epoch=0))
save('TASK_STATE.json',dict(phase='preprocessing',pcTrainingAuthorized=True,optimizer='AdamW',phoneOperations=0,trainingUpdates=0))
print(json.dumps(dict(parameters=len(weights),features=len(schema['candidate']['keys']),oldParameters=len(json.loads((HERE/'baseline.json').read_text())['weights']))))
