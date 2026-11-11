"""只读手机采集的本地归档与清单，所有输出写入新的时间戳目录。"""
import collections
import ctypes
import datetime
import hashlib
import json
import os
from pathlib import Path
import platform
import shutil
import time

ROOT = Path(__file__).resolve().parents[2]
OUT = Path(__file__).resolve().parent
TZ = datetime.timezone(datetime.timedelta(hours=8))


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def main():
    start = time.perf_counter()
    stamp = datetime.datetime.now(TZ).strftime('%Y%m%d_%H%M%S')
    dest = OUT / ('snapshot_' + stamp)
    dest.mkdir(exist_ok=False)
    names = [
        'captures/phone-compressed-2000-20261015/dataset-3000-index.json',
        'captures/phone-compressed-2000-20261015/manifest.json',
        'captures/phone-storage-1000-20261015/manifest.json',
        'captures/phone-compressed-2000-20261015/curriculum-continuity.json',
        'captures/phone-compressed-2000-20261015/3000局最终验收.json',
        'captures/phone-continuation-61-20261015/continuation-status.json',
        'captures/phone-continuation-61-20261015/continuation-outcomes.json',
        'captures/phone-continuation-61-20261015/continuation-chain-verification.json',
        'captures/phone-continuation-61-20261015/stalemate-policy.json',
        'captures/phone-continuation-61-20261015/cycle-review-r0033/cycle-review.json',
    ]
    # 同一批文件双读相等，只保证读取窗口稳定；跨文件业务版本另行核验。
    for attempt in range(5):
        raw = {n: (ROOT / n).read_bytes() for n in names}
        if all((ROOT / n).read_bytes() == b for n, b in raw.items()):
            break
    else:
        raise RuntimeError('动态文件连续变化，未取得稳定读取窗口')
    ids = []
    obj = {}
    for i, (n, b) in enumerate(raw.items()):
        p = ROOT / n
        target = f'{i:02d}_{p.name}'
        (dest / target).write_bytes(b)
        obj[n] = json.loads(b)
        ids.append(dict(source=n, copy=target, sha256=sha(b), bytes=len(b),
                        modified_ns=p.stat().st_mtime_ns))
    index = obj[names[0]]
    games = index['games']
    status = obj[names[5]]
    outcomes = obj[names[6]]
    chain = obj[names[7]]
    assert status['round'] == outcomes['checked_round']
    assert status['total_natural_ends'] == outcomes['natural_ends_in_3000']
    assert set(status['completed']) | set(status['stopped']) | set(outcomes['still_running']) == {g['id'] for g in games if not g['natural_end']}
    assert len({g['id'] for g in games}) == len({g['seed'] for g in games}) == 3000
    overrides = {g['original_id']: g for g in outcomes['outcome_overrides']}
    joined = [{**g, **overrides.get(g['id'], {}), 'effective_actions': overrides.get(g['id'], {}).get('global_actions', g['actions'])} for g in games]
    def summarize(rows):
        lengths = sorted(r['effective_actions'] for r in rows)
        return dict(games=len(rows), original_actions=sum(r['actions'] for r in rows),
                    effective_actions=sum(lengths), natural=sum(r['natural_end'] for r in rows),
                    length_min=min(lengths), length_p50=lengths[len(lengths)//2],
                    length_p90=lengths[int(len(lengths)*.9)], length_max=max(lengths))
    # 未结束的最新累计长度来自已核验段，不把续跑段加成新对局。
    segment_end = {}
    for s in status['segments']:
        segment_end[s['original_id']] = max(segment_end.get(s['original_id'], 0), s['global_end'])
    for g in joined:
        g['effective_actions'] = max(g['effective_actions'], segment_end.get(g['id'], 0))
    by_map = {k:summarize([g for g in joined if g['map']==k]) for k in sorted({g['map'] for g in games})}
    by_plan = {k:summarize([g for g in joined if g['planId']==k]) for k in sorted({g['planId'] for g in games})}
    by_players = {k:summarize([g for g in joined if g['map'].startswith('('+str(k)+')')]) for k in (2,3,4)}
    jobs = obj[names[1]]['jobs'] + obj[names[2]]['jobs']
    assert {j['id'] for j in jobs} == {g['id'] for g in games}
    presets = collections.Counter()
    preset_games = collections.Counter()
    for j in jobs:
        if j.get('state'):
            units = j['state']['units']
            presets.update(str(u['type']) for u in units)
            preset_games.update(set(str(u['type']) for u in units))
    archive_paths = sorted({(ROOT/names[0]).parent / g['archive'] for g in games})
    archives = [dict(path=str(p.relative_to(ROOT)).replace('\\','/'), bytes=p.stat().st_size) for p in archive_paths]
    cont_archives = [dict(path=str(p.relative_to(ROOT)).replace('\\','/'), bytes=p.stat().st_size)
                     for p in sorted((ROOT/'captures/phone-continuation-61-20261015').glob('continuation-round-????.tar.gz'))]
    long = sorted(joined, key=lambda g:g['effective_actions'], reverse=True)
    total = summarize(joined)
    repeated_types = collections.Counter()
    for s in status['segments']:
        repeated_types.update(s.get('action_types', {}))
    resources = dict(observed_at=datetime.datetime.now(TZ).isoformat(), logical_cpus=os.cpu_count(),
                     processor=platform.processor(), python=platform.python_version(),
                     disk={d:dict(zip(('total','used','free'), shutil.disk_usage(d))) for d in ('C:/','D:/')},
                     gpu='CIM不可用；PATH无nvidia-smi；不能认定GPU不存在')
    class Memory(ctypes.Structure):
        _fields_ = [('length',ctypes.c_ulong),('load',ctypes.c_ulong)] + [(n,ctypes.c_ulonglong) for n in ('total_phys','avail_phys','total_page','avail_page','total_virtual','avail_virtual','extended')]
    mem = Memory(); mem.length = ctypes.sizeof(mem)
    if ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(mem)):
        resources['memory'] = {n:getattr(mem,n) for n in ('load','total_phys','avail_phys')}
    summary = dict(observed_at=datetime.datetime.now(TZ).isoformat(), read_attempt=attempt+1,
        stable_double_read=True, latest_round=status['round'], active_round=status.get('active_round'),
        latest_updated_at=status['updated_at'], chain_verified_round=chain['checked_round'],
        chain_additional_actions=chain['additional_actions'], status_additional_actions=sum(s['actions'] for s in status['segments']),
        segments=len(status['segments']), total=total, by_map=by_map, by_plan=by_plan,
        by_players=by_players, stopped=list(status['stopped']), running=outcomes['still_running'],
        top_61_action_share=sum(g['effective_actions'] for g in long[:61])/total['effective_actions'],
        top_61_actions=sum(g['effective_actions'] for g in long[:61]),
        native_end_values=dict(collections.Counter(str(g['winner_mask']) for g in joined if g['natural_end'])),
        preset_unit_counts=dict(presets), preset_games_per_unit=dict(preset_games),
        preset_note='仅manifest中的人为构造初态，不代表实际技能或罕见兵种的决策覆盖',
        continuation_action_types=dict(repeated_types), archives=archives, continuation_archives=cont_archives,
        archive_bytes=sum(p['bytes'] for p in archives), continuation_archive_bytes=sum(p['bytes'] for p in cont_archives),
        source_identity=ids, resources=resources, seconds=time.perf_counter()-start)
    (dest/'summary.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2),encoding='utf8')
    print(json.dumps(dict(snapshot=str(dest), total=total, latest_round=status['round'], chain_round=chain['checked_round'],
                         status_added=summary['status_additional_actions'], top61_share=summary['top_61_action_share'],
                         resources=resources),ensure_ascii=False))


if __name__ == '__main__':
    main()
