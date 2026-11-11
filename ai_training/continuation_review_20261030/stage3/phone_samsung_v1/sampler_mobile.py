"""使用只读紧凑位置表复现PC采样顺序，减少手机内存。"""
import copy
import json
from pathlib import Path
import random
from collections import Counter
import numpy as np


class MobileSampler:
    def __init__(self,folder,seed=20261030):
        folder=Path(folder)
        self.rng=random.Random(seed)
        self.cursor,self.schedule,self.exposures=0,[],Counter()
        self.tree,self.phases={},{}
        positions=np.load(folder/'POSITIONS.npy',mmap_mode='r')
        self.parents=json.loads((folder/'SAMPLER_PARENTS.json').read_text('utf-8'))
        for p in self.parents:
            group=p['isolationGroupId']
            self.tree.setdefault((p['corpus'],p['players']),{}).setdefault(p['category'],{}).setdefault(p['source'],{}).setdefault(group,[]).append(p)
            if p['corpus']=='new':
                self.phases[p['parentId']]={phase:positions[start:start+count] for phase,start,count in p['phaseOffsets']}

    def batch(self,count=8):
        result,used=[],set()
        for _ in range(count):
            if not self.schedule:
                self.schedule=[('old',2)]*17+[('new',2)]*17+[('new',3)]*33+[('new',4)]*33
                self.rng.shuffle(self.schedule)
            corpus,players=self.schedule.pop()
            categories=self.tree[(corpus,players)]
            for _attempt in range(1000):
                category=self.rng.choice(list(categories))
                source=self.rng.choice(list(categories[category]))
                groups=categories[category][source]
                group=self.rng.choice(list(groups))
                p=self.rng.choice(groups[group])
                if group not in used:break
            else:raise ValueError('无法获得八个不同隔离组')
            used.add(group)
            if corpus=='new':
                phases=self.phases[p['parentId']]
                phase=self.rng.choice(list(phases))
                macro,sub,_=self.rng.choice(phases[phase])
            else:
                phase=self.rng.randrange(3)
                low,high=p['actions']*phase//3,p['actions']*(phase+1)//3
                macro,sub=self.rng.randrange(low,max(low+1,high)),-1
            result.append(dict(parentId=p['parentId'],macro=int(macro),sub=int(sub),choice=self.rng.getrandbits(32),split='train'))
            for key in [f'corpus/{corpus}',f'players/{players}',f'cell/{corpus}/{players}/{category}',
                f'source/{players}/{category}/{source}',f'parent/{p["parentId"]}',f'group/{group}',f'phase/{corpus}/{players}/{phase}']:
                self.exposures[key]+=1
            self.cursor+=1
        return result

    def effective_batch(self):
        return [r for _ in range(4) for r in self.batch(8)]

    def state_dict(self):
        return dict(rng=self.rng.getstate(),cursor=self.cursor,schedule=copy.deepcopy(self.schedule),exposures=dict(self.exposures))

    def load_state_dict(self,state):
        self.rng.setstate(state['rng']);self.cursor=state['cursor']
        self.schedule=copy.deepcopy(state['schedule']);self.exposures=Counter(state['exposures'])
