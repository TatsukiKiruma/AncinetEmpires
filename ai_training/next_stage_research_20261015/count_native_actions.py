"""单线程流读原3000局动作；不解压落盘状态，不运行游戏或采集器。"""
import collections
import datetime
import gzip
import hashlib
import json
from pathlib import Path
import tarfile
import time

ROOT = Path(__file__).resolve().parents[2]
OUT = Path(__file__).resolve().parent


def main():
    started = time.perf_counter()
    catalog = ROOT/'captures/phone-compressed-2000-20261015/dataset-3000-index.json'
    games = json.loads(catalog.read_text(encoding='utf8'))['games']
    by_id = {g['id']:g for g in games}
    paths = sorted({(catalog.parent/g['archive']).resolve() for g in games})
    rows = {}
    for path in paths:
        archive_start = time.perf_counter()
        with tarfile.open(path, 'r|gz') as tar:
            for member in tar:
                if not member.isfile():
                    continue
                ident = member.name.split('/')[0]
                if ident not in by_id:
                    continue
                row = rows.setdefault(ident, dict(id=ident, planId=by_id[ident]['planId'], map=by_id[ident]['map']))
                if member.name.endswith(('/initial.bin','/config.bin','/final.bin')):
                    row[Path(member.name).stem+'_sha256'] = hashlib.sha256(tar.extractfile(member).read()).hexdigest()
                if not member.name.endswith(('/actions.jsonl','/actions.jsonl.gz')):
                    continue
                source = tar.extractfile(member)
                if member.name.endswith('.gz'):
                    source = gzip.GzipFile(fileobj=source)
                types = collections.Counter()
                raw_hash, semantic_hash = hashlib.sha256(),hashlib.sha256()
                count = 0
                repeated = 0
                previous = None
                longest_run = current_run = 0
                for line in source:
                    raw_hash.update(line)
                    action = json.loads(line)
                    assert action['index'] == count
                    assert action['ai_seed'] == by_id[ident]['seed'] + count*104729
                    f = action['fields']
                    types[str(f['j'])] += 1
                    semantic = json.dumps(f, sort_keys=True,separators=(',',':')).encode()
                    semantic_hash.update(semantic+b'\n')
                    if semantic == previous:
                        repeated += 1
                        current_run += 1
                    else:
                        current_run = 1
                    longest_run=max(longest_run,current_run)
                    previous=semantic
                    count += 1
                assert count == by_id[ident]['actions']
                row.update(actions=count, types=dict(types), raw_action_sha256=raw_hash.hexdigest(),
                           field_sequence_sha256=semantic_hash.hexdigest(), adjacent_equal_fields=repeated,
                           longest_identical_field_run=longest_run)
        print(json.dumps(dict(archive=path.name, games_done=sum('actions' in r for r in rows.values()),
                              seconds=round(time.perf_counter()-archive_start,2))),flush=True)
    assert len(rows)==3000 and all('actions' in r for r in rows.values())
    all_types = collections.Counter()
    by_plan = {}
    for row in rows.values():
        all_types.update(row['types'])
        by_plan.setdefault(row['planId'],collections.Counter()).update(row['types'])
    duplicates = {}
    for kind in ('initial_sha256','raw_action_sha256','field_sequence_sha256'):
        groups=collections.defaultdict(list)
        for r in rows.values():
            groups[r[kind]].append(r['id'])
        duplicates[kind]=[v for v in groups.values() if len(v)>1]
    dest=OUT/('native_action_stats_'+datetime.datetime.now().strftime('%Y%m%d_%H%M%S')+'.json')
    report=dict(actions=sum(all_types.values()),games=3000,types=dict(all_types),by_plan=by_plan,
                duplicate_groups=duplicates, games_detail=list(rows.values()),seconds=time.perf_counter()-started,
                scope='仅原始3000局；字段轨迹相同不等于完整状态/随机流相同；初态相同也不等于独立对局身份相同')
    with dest.open('x',encoding='utf8') as f:
        json.dump(report,f,ensure_ascii=False,indent=2)
    print(json.dumps(dict(output=str(dest),actions=report['actions'],types=report['types'],seconds=report['seconds'])))


if __name__=='__main__':
    main()
