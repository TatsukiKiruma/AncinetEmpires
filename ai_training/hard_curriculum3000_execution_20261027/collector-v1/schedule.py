"""冻结三批分层调度；执行局号不改变设计槽位和种子身份。"""
from collections import Counter, defaultdict
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
PLAN = ROOT / 'ai_training/hard_curriculum3000_plan_20261027'
OUT = ROOT / 'ai_training/hard_curriculum3000_execution_20261027'

def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()

def write(path, obj):
    with Path(path).open('x', encoding='utf-8', newline='\n') as f:
        f.write(json.dumps(obj, ensure_ascii=False, indent=2) + '\n')

def build():
    slots = json.loads((PLAN / 'DESIGN_SLOTS.json').read_text(encoding='utf-8'))['slots']
    cells = defaultdict(list)
    for slot in slots:
        cells[slot['category'], slot['actualPlayerCount']].append(slot)
    batches = [defaultdict(list) for _ in range(3)]
    for cell, members in sorted(cells.items()):
        capacity = len(members) // 3
        assert capacity * 3 == len(members)
        counts = [Counter() for _ in range(3)]
        ordered = sorted(members, key=lambda s: (s['profile'], s['proposedMap'], s['focusSeatOrdinal'], s['nativeSeed']))
        for slot in ordered:
            keys = [('profile', slot['profile']), ('map', slot['proposedMap']), ('focus', slot['focusSeatOrdinal']), ('actor', slot['firstActorOrdinal'])]
            candidates = [i for i in range(3) if len(batches[i][cell]) < capacity]
            chosen = min(candidates, key=lambda i: tuple(counts[i][k] for k in keys) + (len(batches[i][cell]), i))
            batches[chosen][cell].append(slot)
            counts[chosen].update(keys)
    rows, reports = [], []
    for batch_no, cells_in_batch in enumerate(batches, 1):
        ordered_cells = sorted(cells_in_batch)
        for cell in ordered_cells:
            cells_in_batch[cell].sort(key=lambda s: hashlib.sha256(s['slotId'].encode()).hexdigest())
        arranged = []
        # 每格前两局组成42局现场观察，随后按剩余配额交错，不等待其他设备。
        for _ in range(2):
            for cell in ordered_cells:
                arranged.append(cells_in_batch[cell].pop(0))
        while any(cells_in_batch.values()):
            for cell in ordered_cells:
                if cells_in_batch[cell]:
                    arranged.append(cells_in_batch[cell].pop(0))
        assert len(arranged) == 1000
        category = Counter(s['category'] for s in arranged)
        players = Counter(s['actualPlayerCount'] for s in arranged)
        assert sorted(category.values()) == [100, 100, 100, 100, 100, 200, 300]
        assert players == {2: 400, 3: 300, 4: 300}
        assert Counter((s['category'], s['actualPlayerCount']) for s in arranged[:42]) == {c: 2 for c in ordered_cells}
        reports.append({'batch': batch_no, 'category': dict(category), 'players': dict(players),
                        'profiles': dict(Counter(s['profile'] for s in arranged))})
        for offset, slot in enumerate(arranged):
            rows.append({'executionSequence': (batch_no-1)*1000+offset+1, 'batch': batch_no,
                         'device': 'mi8' if batch_no == 1 else ('samsung_waiting_user' if batch_no == 2 else 'unassigned'),
                         'observation': offset < 42, 'designSlotId': slot['slotId'], 'seed': slot['nativeSeed']})
    assert len({r['designSlotId'] for r in rows}) == 3000
    OUT.mkdir(exist_ok=False)
    write(OUT / 'EXECUTION_SEQUENCE.json', {'schema': 'hard-curriculum-sequence-v1', 'designSha256': sha(PLAN/'DESIGN_SLOTS.json'), 'batches': reports, 'rows': rows})
    write(OUT / 'AUTHORIZATION.json', {'schema': 'hard-curriculum-authorization-v1',
        'source': '用户新建本对话时的明确委派与授权', 'date': '2026-10-27',
        'authorized': ['必要采集器适配', '小米8 c2357770 第1—1000局 2 worker 离线独立采集'],
        'samsung': '等待用户通知并核实设备后执行1001—2000局', 'batch3': '未指定设备，不启动',
        'strict': 'disabled_by_user', 'forced': 'disabled_by_user', 'apkNativeReplay': 'disabled_by_user',
        'training': False, 'tensorGeneration': False, 'automaticDatasetAdmission': False,
        'changesFromDesign': ['旧每机1500局改为三个1000局分层批次', '首126局观察改为每批42局且计入配额', '小米直接配置2 worker'],
        'originalPlanPreserved': True})
    print(json.dumps({'out': str(OUT), 'batches': reports}, ensure_ascii=False))

if __name__ == '__main__':
    build()
