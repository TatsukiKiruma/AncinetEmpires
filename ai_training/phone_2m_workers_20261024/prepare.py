"""冻结已授权的两段十局续训输入；不执行重放或优化器更新。"""
import hashlib
import json
from pathlib import Path
import shutil

HERE = Path(__file__).resolve().parent
BASE = HERE.parent / 'phone_2m_scratch100_20261024'


def load(p):
    return json.loads(p.read_text(encoding='utf-8'))


def save(p, value):
    p.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def main():
    if (HERE / 'PLAN.json').exists():
        raise RuntimeError('已有冻结计划，不覆盖')
    split = load(BASE / 'SPLIT.json')
    order = load(BASE / 'REFERENCE_ORDER.json')['epoch1']
    assert order[:100] == [p['parentId'] for p in split['pilot']]
    byid = {p['parentId']: p for p in split['train']}
    chosen = [byid[parent] for parent in order[100:120]]
    assert len(chosen) == 20
    for p in chosen:
        p['knownAtomicActions'] = p['knownAtomicActions'] or p['intendedAtomicPositions']
    save(HERE / 'SPLIT.json', {'pilot': chosen, 'baseSplitSha256': hashlib.sha256((BASE / 'SPLIT.json').read_bytes()).hexdigest(), 'newStrictReplayExecuted': False})
    protocol = load(BASE / 'PROTOCOL.json')
    protocol.update(authorization='用户授权小米8两worker续训101–110局，再三worker续训111–120局；完成后停止', authorizedParents=20, torchThreadsPerWorker=2, coordinatorThreads=1, resumeTestAfterUpdates=None)
    save(HERE / 'PROTOCOL.json', protocol)
    text = (BASE / 'convert.ts').read_text(encoding='utf-8')
    (HERE / 'convert.ts').write_text(text, encoding='utf-8')
    for name in ['model.py', 'batch_model.py', 'accurate_ops.py']:
        shutil.copy2(BASE / 'payload' / name, HERE / name)
    shutil.copy2(BASE / 'train_phone.py', HERE / 'train_phone.py')
    plan = {'schema': 'phone-2m-synchronous-workers-benchmark-v1', 'serial': 'c2357770', 'baseCheckpoint': str(BASE / 'completion/output/checkpoint-1.pt'),
            'baseCheckpointSha256': load(BASE / 'completion/output/LATEST.json')['sha256'], 'baseStep': 9139, 'baseSamples': 73112,
            'effectiveBatch': 8, 'microbatch': 1, 'threadsPerWorker': 2, 'coordinatorThreads': 1, 'parameters': 1966910,
            'segments': [{'name': 'workers2', 'workers': 2, 'parentRange': [101, 110], 'parentIds': order[100:110]},
                         {'name': 'workers3', 'workers': 3, 'parentRange': [111, 120], 'parentIds': order[110:120]}],
            'continuation': '第二段完整恢复第一段模型、AdamW、scheduler、RNG后续训；不独立训练后平均权重',
            'comparison': '十父局墙钟时间及样本吞吐；地图、候选数和局长不同，不是同数据受控加速比',
            'automaticFullTraining': False, 'newStrictReplayExecuted': False, 'stopAfterParents': 120}
    save(HERE / 'PLAN.json', plan)
    print(json.dumps({'parents': len(chosen), 'intendedSamples': [sum(p['knownAtomicActions'] for p in chosen[:10]), sum(p['knownAtomicActions'] for p in chosen[10:])],
                      'existingStrictStatus': [p['existingProjectStatus'] for p in chosen]}, ensure_ascii=False))


if __name__ == '__main__':
    main()
