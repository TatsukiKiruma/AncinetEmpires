"""按人数和模式双重等权选择严格准入收据，不足配额时禁止标记可训练。"""
import collections
import gzip
import hashlib
import json
from pathlib import Path
import sys


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def select(split, reports):
    quota = 150 if split == 'train' else 30
    groups = collections.defaultdict(list)
    visited, identities = set(), set()
    def visit(path):
        path = path.resolve()
        if str(path) in visited:
            return
        visited.add(str(path))
        report = json.loads(path.read_text(encoding='utf-8'))
        if report['split'] != split:
            raise ValueError('禁止跨分区合并')
        if link := report.get('previousReport'):
            previous = Path(link['path'])
            if digest(previous) != link['sha256']:
                raise ValueError('审计链摘要变化')
            visit(previous)
        for item in report['rows']:
            if not item['accepted']:
                continue
            file = path.parent / item['file']
            row = json.loads(gzip.decompress(file.read_bytes()))
            identity = (row['parentId'], row['seed'])
            if identity in identities:
                raise ValueError('重复对局身份')
            identities.add(identity)
            if row['split'] != split or len(row['samples']) != 12 or not row['natural'] or row['winner'] in (None, -1):
                raise ValueError('准入合同不一致')
            groups[(row['players'], row['mode'])].append({'path': str(file), 'sha256': digest(file), 'parentId': row['parentId'], 'seed': row['seed']})
    for path in reports:
        visit(path)
    deficits, selected = {}, []
    for players in (2, 3, 4):
        for mode in ('A', 'B'):
            pool = sorted(groups[(players, mode)], key=lambda r: r['sha256'])
            deficits[f'{players}P-{mode}'] = max(0, quota - len(pool))
            selected.extend(pool[:quota])
    return {'split': split, 'ready': not any(deficits.values()), 'deficits': deficits, 'selectedGames': len(selected), 'selectedSamples': 12 * len(selected), 'rows': selected, 'sealedAccess': 0}


if __name__ == '__main__':
    split, output, *reports = sys.argv[1:]
    if split not in ('train', 'dev'):
        raise ValueError('分区无效')
    result = select(split, [Path(p) for p in reports])
    with Path(output).open('x', encoding='utf-8') as stream:
        json.dump(result, stream, ensure_ascii=False, indent=2)
    print(json.dumps({k: v for k, v in result.items() if k != 'rows'}))
