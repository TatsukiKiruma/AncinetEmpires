"""冻结独立阶段三合同；历史合同仅作为只读依赖。"""
import hashlib
import json
from pathlib import Path
HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[2]
def sha(p):
    with p.open('rb') as f:
        return hashlib.file_digest(f,'sha256').hexdigest()
paths=set()
for folder in [ROOT/'src',ROOT/'ai_training/gpu',ROOT/'ai_training/expert_iteration_2m_20261022',
               ROOT/'ai_training/dual_stream_v2_phase2_20261020',ROOT/'ai_training/data_acceptance_20261016/native_reader',
               ROOT/'ai_training/data_acceptance_20261016/phone']:
    paths.update(p for p in folder.rglob('*') if p.is_file() and p.suffix in ['.ts','.tsx','.py','.mjs'] and '__pycache__' not in p.parts and 'runs' not in p.parts)
for folder in [HERE,HERE.parent/'stage1',HERE.parent/'stage2/runner_v4_sync1']:
    paths.update(p for p in folder.glob('*') if p.suffix in ['.py','.ts'])
for name in ['PARTITIONS.json','OFFLINE_PANEL.json','ARENA_PANEL.json','SCIENCE_CONTRACT.json','RUNNER_CONTRACT.json']:
    paths.add(HERE.parent/'stage1'/name)
for name in ['CONFIG.json','OMNI_ARENA_DEV_PANEL.json','OMNI_ARENA_TEST_PANEL.json','DEV_INITIAL_MANIFEST.json','BASELINE_REUSE.json','PERFORMANCE_REVISION.json']:
    paths.add(HERE/name)
paths.update((HERE/'dev-initial').glob('*.json'))
target=HERE/'SCIENCE_CONTRACT.json'
if target.exists():
    raise ValueError('合同已存在，不能覆盖')
contract=dict(schema='stage3-omni-v1',files={str(p.relative_to(ROOT)).replace('\\','/'):sha(p) for p in sorted(paths)},
    authorization='用户明确授权新建第三阶段；旧阶段审核门禁不控制本独立合同',
    sealedAccess='训练与开发编码器拒绝test；最终候选锁定后独立编码器才允许test',
    baselineCheckpointSha256='338dea17879354363c7e76a9921eb97ec0bf9e2d87709661b55a9b82af86a34b')
target.write_text(json.dumps(contract,ensure_ascii=False,indent=2),'utf-8')
print(json.dumps(dict(files=len(paths),sha256=sha(target))))
