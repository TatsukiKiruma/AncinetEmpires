"""分层混合抽样；概率只作用于采样，损失权重恒为一。"""
import copy
import json
import random
from collections import Counter, defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent


class Sampler:
    def __init__(self, manifest, seed=20261030, new_ratio=.6, duel_ratio=.75):
        self.rng = random.Random(seed)
        self.cursor = 0
        self.new_ratio = new_ratio
        self.new_duel = (duel_ratio - (1 - new_ratio)) / new_ratio
        if not 0 <= self.new_duel <= 1:
            raise ValueError('双人目标与新旧混合比例不可同时满足')
        self.rows = [r for r in manifest['parents'] if r['split'] == 'train' and (r['corpus'] == 'old' or r['admitted'])]
        self.tree = {}
        for p in self.rows:
            node = self.tree.setdefault(p['corpus'], {}).setdefault(p['players'], {}).setdefault(p['category'], {}).setdefault(p['source'], {}).setdefault(p.get('isolationGroupId', p['groupId']), [])
            node.append(p)
        self.exposures = Counter()

    def choose(self, mapping):
        return self.rng.choice(list(mapping))

    def batch(self, count=8):
        result, used = [], set()
        for _ in range(count):
            corpus = 'new' if self.rng.random() < self.new_ratio else 'old'
            players = 2 if corpus == 'old' or self.rng.random() < self.new_duel else self.rng.choice([3, 4])
            for attempt in range(1000):
                categories = self.tree[corpus][players]
                category = self.choose(categories)
                sources = categories[category]
                source = self.choose(sources)
                groups = sources[source]
                group = self.choose(groups)
                p = self.rng.choice(groups[group])
                if group not in used:
                    break
            else:
                raise RuntimeError('不能在有效批次内获得不同父局')
            used.add(group)
            if corpus == 'new':
                phases = defaultdict(list)
                for pos in p['positions']:
                    phases[pos[2]].append(pos)
                phase = self.choose(phases)
                macro, sub, _ = self.rng.choice(phases[phase])
            else:
                # 旧样本随机选整局宏区间，避免只训练曾做前缀关联的32宏。
                phase = self.rng.randrange(3)
                low, high = p['actions'] * phase // 3, p['actions'] * (phase + 1) // 3
                macro, sub = self.rng.randrange(low, max(low + 1, high)), -1
            item = dict(parentId=p['parentId'], macro=macro, sub=sub, choice=self.rng.getrandbits(32), split='train')
            result.append(item)
            for key in [f'corpus/{corpus}', f'players/{players}', f'cell/{corpus}/{players}/{category}', f'source/{source}', f'parent/{p["parentId"]}', f'phase-stratum/{phase}']:
                self.exposures[key] += 1
            self.cursor += 1
        return result

    def state_dict(self):
        return dict(rng=self.rng.getstate(), cursor=self.cursor, exposures=dict(self.exposures))

    def load_state_dict(self, value):
        self.rng.setstate(value['rng'])
        self.cursor = value['cursor']
        self.exposures = Counter(value['exposures'])


def verify():
    manifest = json.loads((HERE / 'PARTITIONS.json').read_text('utf-8'))
    sampler = Sampler(manifest)
    group_by_parent = {p['parentId']: p['isolationGroupId'] for p in manifest['parents']}
    for _ in range(12500):
        batch = sampler.batch()
        assert len({r['parentId'] for r in batch}) == 8
        assert len({group_by_parent[r['parentId']] for r in batch}) == 8
    state = copy.deepcopy(sampler.state_dict())
    expected = sampler.batch()
    restored = Sampler(manifest)
    restored.load_state_dict(state)
    assert restored.batch() == expected
    counts = state['exposures']
    summary = dict(samples=100000, expected=dict(new=.6, old=.4, players2=.75, players3=.125, players4=.125), actual={k: v for k, v in counts.items() if not k.startswith('parent/')}, maxParentExposures=max(v for k, v in counts.items() if k.startswith('parent/')), parentsExposed=sum(k.startswith('parent/') for k in counts), distinctParentsPerBatch=True, distinctIsolationGroupsPerBatch=True, samplerResumeExact=True, sampleWeight=1, longGamePolicy='组/场景/来源/父局/阶段分层抽样，长局不按动作量增加入选概率；旧局阶段使用宏位置三等分，新局按真实回合阶段')
    for key, target in [('corpus/new', .6), ('players/2', .75), ('players/3', .125), ('players/4', .125)]:
        assert abs(counts[key] / 100000 - target) < .01
    (HERE / 'SAMPLING_VERIFIED.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2), 'utf-8')
    print(json.dumps(summary, ensure_ascii=False))


if __name__ == '__main__':
    verify()
