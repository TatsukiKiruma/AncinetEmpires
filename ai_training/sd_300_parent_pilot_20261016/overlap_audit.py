import pathlib, json, gzip, collections, hashlib

ROOT = pathlib.Path(__file__).resolve().parent


def main():
    selection = json.loads((ROOT/'selection.json').read_text(encoding='utf-8-sig'))
    audit = json.loads((ROOT/'data-audit.json').read_text(encoding='utf-8-sig'))
    sequences = collections.defaultdict(list)
    all_train = {k:set() for k in ['rule','semantic','input']}
    cross = {k:0 for k in all_train}
    for name, keys in [('row-audit.jsonl.gz',['rule','semantic']),('input-audit.jsonl.gz',['input'])]:
        with gzip.open(ROOT/name,'rt',encoding='utf-8') as stream:
            for line in stream:
                r = json.loads(line)
                if 'semantic' in keys:
                    sequences[r['segmentId']].append(r['semantic'])
                for k in keys:
                    if r['split']=='train': all_train[k].add(r[k])
                    else: cross[k] += r[k] in all_train[k]
    assert cross == audit['overlaps']['validation']['crossTrain']
    trains = [sequences[e['segmentId']] for p in selection['parents'] if p['split']=='train' for e in p['segments'] if e['admittedAtoms']]
    transitions = set((a,b) for seq in trains for a,b in zip(seq,seq[1:]))
    validation = []
    for p in selection['parents']:
        if p['split']!='validation': continue
        for e in p['segments']:
            seq = sequences[e['segmentId']]
            if not seq: continue
            longest = 0
            for train in trains:
                common = 0
                for a,b in zip(seq,train):
                    if a!=b: break
                    common += 1
                longest = max(longest,common)
            validation.append(dict(parentId=p['parentId'],segmentId=e['segmentId'],states=len(seq),rootSeenAnywhereInTrain=seq[0] in all_train['semantic'],maximumSharedRootPrefixStates=longest,adjacentStatePairs=len(seq)-1,sharedAdjacentStatePairs=sum((a,b) in transitions for a,b in zip(seq,seq[1:])),semanticStateSequenceSha256=hashlib.sha256('\n'.join(seq).encode()).hexdigest()))
    source_path = ROOT.parent/'data_acceptance_20261016/phone/release-2026-10-15T21-05-00-859Z/parent-acceptance.jsonl'
    parents = {r['parentId']:r for r in map(json.loads,source_path.read_text(encoding='utf-8-sig').splitlines())}
    def distribution(key):
        result = collections.defaultdict(lambda:dict(train=0,validation=0))
        for p in selection['parents']: result[p[key]][p['split']] += 1
        return dict(sorted(result.items()))
    result = dict(passed=True,crossCountsIndependentlyRecomputed=cross,trainUniqueCounts={k:len(v) for k,v in all_train.items()},validationRootSeenAnywhereInTrain=sum(v['rootSeenAnywhereInTrain'] for v in validation),validationSharedAdjacentStatePairs=sum(v['sharedAdjacentStatePairs'] for v in validation),validationAdjacentStatePairs=sum(v['adjacentStatePairs'] for v in validation),fullStateSequenceDuplicatesWithTrain=sum(any(sequences[v['segmentId']]==t for t in trains) for v in validation),validation=validation,byMap=distribution('map'),byPlan=distribution('planId'),byPlanKind=distribution('planKind'),fullyStrictSelectedParents=sum(parents[p['parentId']]['fullyStrict'] for p in selection['parents']),sourceMapMoreThanTwoButConfiguredTwoParents=sum(p['segments'][0]['actualBucket']['sourceMapPlayerCount']>2 for p in selection['parents']),limitations=['相邻语义状态对只覆盖已编码前态间的转移；末条后态由权威引擎及收据验证', '完整动作语义轨迹SHA另见data-audit收据；公共初态和前缀交集不构成独立评测', '实体属性完全相同的堆叠引用对称不变性未作完备证明'])
    (ROOT/'overlap-detail.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps({k:v for k,v in result.items() if k not in ['validation','byMap','byPlan','byPlanKind','limitations']}))


if __name__ == '__main__':
    main()
