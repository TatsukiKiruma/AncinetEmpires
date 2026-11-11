"""严格100样本配额周期，层内按场景、来源、隔离组、父局、阶段均衡抽样。"""
import copy
import random
from collections import Counter, defaultdict


class OmniSampler:
    def __init__(self, manifest, seed=20261030):
        self.rng = random.Random(seed)
        self.cursor, self.schedule, self.exposures = 0, [], Counter()
        self.tree, self.phases = {}, {}
        for p in manifest['parents']:
            if p['split'] != 'train' or (p['corpus'] == 'new' and not p['admitted']):
                continue
            if p['corpus'] == 'old' and (p['players'] != 2 or p['category'] != 'old_normal'):
                raise ValueError('旧锚点应为双人正常开局')
            key = (p['corpus'], p['players'])
            group = p.get('isolationGroupId', p['groupId'])
            self.tree.setdefault(key, {}).setdefault(p['category'], {}).setdefault(p['source'], {}).setdefault(group, []).append(p)
            if p['corpus'] == 'new':
                phases = defaultdict(list)
                for position in p['positions']:
                    phases[position[2]].append(position)
                self.phases[p['parentId']] = phases

    def batch(self, count=8):
        result, used = [], set()
        for _ in range(count):
            if not self.schedule:
                self.schedule = [('old', 2)] * 17 + [('new', 2)] * 17 + [('new', 3)] * 33 + [('new', 4)] * 33
                self.rng.shuffle(self.schedule)
            corpus, players = self.schedule.pop()
            categories = self.tree[(corpus, players)]
            for _attempt in range(1000):
                category = self.rng.choice(list(categories))
                source = self.rng.choice(list(categories[category]))
                groups = categories[category][source]
                group = self.rng.choice(list(groups))
                p = self.rng.choice(groups[group])
                if group not in used:
                    break
            else:
                raise ValueError('逻辑微批无法获得八个不同隔离组')
            used.add(group)
            if corpus == 'new':
                phases = self.phases[p['parentId']]
                phase = self.rng.choice(list(phases))
                macro, sub, _ = self.rng.choice(phases[phase])
            else:
                phase = self.rng.randrange(3)
                low, high = p['actions'] * phase // 3, p['actions'] * (phase + 1) // 3
                macro, sub = self.rng.randrange(low, max(low + 1, high)), -1
            result.append(dict(parentId=p['parentId'], macro=macro, sub=sub, choice=self.rng.getrandbits(32), split='train'))
            for name in [f'corpus/{corpus}', f'players/{players}', f'cell/{corpus}/{players}/{category}',
                         f'source/{players}/{category}/{source}', f'parent/{p["parentId"]}', f'group/{group}', f'phase/{corpus}/{players}/{phase}']:
                self.exposures[name] += 1
            self.cursor += 1
        return result

    def effective_batch(self):
        return [item for _ in range(4) for item in self.batch(8)]

    def state_dict(self):
        return dict(rng=self.rng.getstate(), cursor=self.cursor, schedule=copy.deepcopy(self.schedule), exposures=dict(self.exposures))

    def load_state_dict(self, state):
        self.rng.setstate(state['rng'])
        self.cursor, self.schedule = state['cursor'], copy.deepcopy(state['schedule'])
        self.exposures = Counter(state['exposures'])
