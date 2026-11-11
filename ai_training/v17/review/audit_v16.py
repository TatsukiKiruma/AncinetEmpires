"""只读核查 V16 对局、实际训练预算与网络输入重复，输出到 V17。"""
from pathlib import Path
from collections import Counter, defaultdict
import hashlib
import json
import struct

ROOT = Path(__file__).resolve().parents[2]
RUN = ROOT / 'v16/out/v16_20260926_core'

def rows(p):
    with p.open(encoding='utf-8') as f:
        for line in f:
            if line.strip(): yield json.loads(line)

def f32(a):
    return struct.pack('<' + 'f' * len(a), *a)

def input_key(r):
    h = hashlib.sha256(f32(r['spatialTensor']) + f32(r['globalFeatures']))
    # 候选网络特征作为无序多重集；不把动作ID、教师标签和源元数据当作网络输入。
    candidates = []
    for c in r['candidateActions']:
        ch = hashlib.sha256()
        for key in ['actorCoord', 'landingCoord', 'targetCoord']:
            ch.update(json.dumps(c.get(key), sort_keys=True, separators=(',', ':')).encode())
        ch.update(f32(c['semantics']))
        candidates.append(ch.digest())
    h.update(struct.pack('<I', len(candidates)))
    for c in sorted(candidates): h.update(c)
    return h.hexdigest()

arena = defaultdict(list)
for p in sorted((RUN/'arena/dev').glob('*.games.jsonl')):
    for r in rows(p):
        if r.get('arm') == 'CANDIDATE': arena[r['modelTag']].append(r)
arena_out = {}
for tag, rr in arena.items():
    arena_out[tag] = {'rows':len(rr), 'uniqueGames':len({r['gameId'] for r in rr}),
        'outcomes':dict(Counter(r['outcomeKind'] for r in rr)),
        'byMap':{m:dict(Counter(r['outcomeKind'] for r in rr if r['mapName']==m)) for m in sorted({r['mapName'] for r in rr})},
        'modelHashes':sorted({r.get('checkpointSha256','') for r in rr}),
        'errors':sum(bool(r.get('error')) for r in rr), 'fallbacks':sum(bool(r.get('fallbackUsed')) for r in rr)}

ledger = {}
for p in sorted((RUN/'experiments').glob('*/*/*.optimizer_update_ledger.jsonl')):
    rr=list(rows(p)); key='/'.join(p.relative_to(RUN/'experiments').parts[:2])
    metric=json.loads((p.parent/'metrics.json').read_text(encoding='utf-8'))
    ledger[key]={'updates':len(rr),'exposures':sum(len(r['sampleIds']) for r in rr),
        'valueTargetExposureCounter':sum(r.get('valueSupervised',0) for r in rr),
        'valueWeight':metric.get('value_weight'), 'batchPlan':metric.get('batchPlan')}

data = {}
keysets = {}
examples = {}
for split in ['train','val']:
    keys=Counter(); saved=Counter(); families=Counter(); labels=defaultdict(set); entries=[]
    for r in rows(RUN/f'T16-04/dataset_v16_{split}.jsonl'):
        k=input_key(r); keys[k]+=1; saved[r['policyInputKey']]+=1; families[r['rootFamilyId']]+=1
        labels[k].add(r.get('l1ActionCode'))
        entry={'sampleId':r['sampleId'],'key':k,'savedKey':r['policyInputKey'],'mapName':r['mapName'],'family':r['rootFamilyId']}
        entries.append(entry)
        examples.setdefault(k,entry)
    data[split]={'rows':len(entries),'uniqueActualPolicyInputs':len(keys),'duplicateRows':sum(v-1 for v in keys.values()),
        'uniqueSavedPolicyKeys':len(saved),'families':len(families),'maxFamilyRows':max(families.values()),
        'conflictingActionCodeKeys':sum(len(v)>1 for v in labels.values())}
    keysets[split]=set(keys)
    Path(__file__).with_name(f'{split}_input_index.jsonl').write_text(''.join(json.dumps(e,ensure_ascii=False)+'\n' for e in entries),encoding='utf-8')
    if split=='val':
        overlap=[r for r in entries if r['key'] in keysets['train']]
        data[split]['rowsSeenInTrain']=len(overlap)
        data[split]['keysSeenInTrain']=len(keysets['train']&keysets['val'])
        data[split]['overlapExamples']=[{'val':r,'train':examples[r['key']]} for r in overlap[:5]]

result={'run':str(RUN.relative_to(ROOT)),'arena':arena_out,'ledgers':ledger,'data':data,
        'scope':'输入身份按float32状态与完整候选特征多重集；冲突actionCode包含可能等价动作，不能直接视为互斥监督。'}
out=Path(__file__).with_name('v16_audit.json')
out.write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'arena':{k:v['outcomes'] for k,v in arena_out.items()},'ledgers':ledger,'data':{k:{a:b for a,b in v.items() if a!='overlapExamples'} for k,v in data.items()}},ensure_ascii=True))
