"""地图×玩家座位均衡采样；仅改变训练暴露，不改变推理或合法动作。"""
import random,collections
def build_pools(data):
    pools=collections.defaultdict(list);strata=set()
    for i,s in enumerate(data):
        key=(s['sampleMap'],s['samplePlayer']);strata.add(key);t=int(s['candidateSemantics'][s['target'],:14].argmax());source='dagger' if s['sampleFamily'].startswith('dagger_') else 'base'
        for typ in [None,t]:
            for src in [None,source]:pools[(key,typ,src)].append(i)
    return sorted(strata),pools
def sample_ids(built,cfg):
    strata,pools=built;out=[]
    for _ in range(cfg['batchSize']):
        key=random.choice(strata);r=random.random();typ=13 if r<cfg.get('endTurnFraction',.15) else 5 if r<cfg.get('endTurnFraction',.15)+.10 else None
        fraction=cfg.get('daggerFraction');source=None if fraction is None else ('dagger' if random.random()<fraction else 'base')
        available=pools.get((key,typ,source)) or pools.get((key,typ,None)) or pools.get((key,None,source)) or pools[(key,None,None)]
        out.append(random.choice(available))
    return out
