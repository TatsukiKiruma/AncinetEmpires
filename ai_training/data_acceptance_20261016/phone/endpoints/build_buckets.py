"""补充分桶元数据，不修改已完成端点收据，不发布训练标签。"""
import base64
import collections
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import tarfile
import time

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[3]
SNAPSHOT = HERE.parent / 'snapshot_20261016_001729'


def main():
    start = time.monotonic()
    if (HERE / 'parent-buckets.jsonl').exists():
        raise RuntimeError('分桶文件已存在，拒绝覆盖')
    read = lambda name: json.loads((SNAPSHOT / name).read_text(encoding='utf-8'))
    catalog = read('00_dataset-3000-index.json')
    manifests = [read('01_manifest.json'), read('02_manifest.json')]
    jobs = {}
    plans = {}
    for manifest in manifests:
        for job in manifest['jobs']:
            if job['id'] in jobs:
                raise RuntimeError('原局manifest ID重复')
            jobs[job['id']] = job
        for plan in manifest['plans']:
            if plan['id'] in plans and plans[plan['id']] != plan:
                raise RuntimeError('场景计划不一致')
            plans[plan['id']] = plan
    outcomes = {row['parentId']: row for row in map(json.loads, (HERE / 'parent-outcomes.jsonl').read_text(encoding='utf-8').splitlines())}
    groups = collections.OrderedDict()
    for game in catalog['games']:
        groups.setdefault((ROOT / 'captures/phone-compressed-2000-20261015' / game['archive']).resolve(), {})[game['id']] = game
    proc = subprocess.Popen(['node', '--import', 'tsx', str(HERE / 'decode_bucket_config.ts')], cwd=ROOT, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                            stderr=(HERE / 'bucket-decoder-stderr.log').open('xb'))
    output = (HERE / 'parent-buckets.jsonl').open('x', encoding='utf-8', newline='\n')
    counters = {name: collections.Counter() for name in ['mode', 'sourceMapPlayers', 'configuredPlayers', 'planKind', 'artificialEndgame', 'presetState']}
    count = 0
    try:
        for archive, group in groups.items():
            if shutil.disk_usage(ROOT).free < 12 * 1024 ** 3:
                raise RuntimeError('C盘低于12GiB，仅停止自身')
            before = archive.stat()
            seen = set()
            with tarfile.open(archive, 'r|gz', bufsize=1024 * 1024) as tar:
                for member in tar:
                    ident, _, name = member.name.removeprefix('./').partition('/')
                    if ident not in group or name != 'config.bin' or not member.isfile():
                        continue
                    if ident in seen or member.size > 2 * 1024 * 1024:
                        raise RuntimeError('配置重复或过大')
                    seen.add(ident)
                    config_bytes = tar.extractfile(member).read()
                    proc.stdin.write((json.dumps({'id': ident, 'config': base64.b64encode(config_bytes).decode()}) + '\n').encode()); proc.stdin.flush()
                    config = json.loads(proc.stdout.readline())
                    if not config.get('ok') or config['sha256'] != outcomes[ident]['configSha256']:
                        raise RuntimeError('补充分桶配置未通过原验收SHA身份')
                    game, job = group[ident], jobs[ident]
                    for key in ['map', 'seed', 'planId', 'planKind']:
                        if game[key] != job[key]:
                            raise RuntimeError('catalog与manifest分桶身份不一致')
                    plan = plans[job['planId']]
                    if plan['kind'] != job['planKind']:
                        raise RuntimeError('场景kind不符')
                    preset = job.get('state') is not None
                    endgame = plan['kind'] == 'advantage_endgame'
                    if endgame and (not preset or not plan.get('derivation', {}).get('profile')):
                        raise RuntimeError('人工残局缺派生证据')
                    row = dict(parentId=ident, configSha256=config['sha256'], configMode=config['mode'],
                               sourceMapTeamIds=config['sourceMapTeamIds'], sourceMapPlayerCount=len(config['sourceMapTeamIds']),
                               configuredTeamIds=config['configuredTeamIds'], configuredPlayerCount=len(config['configuredTeamIds']),
                               planId=job['planId'], planKind=job['planKind'], hasPresetState=preset, artificialEndgame=endgame,
                               derivationProfile=plan.get('derivation', {}).get('profile'),
                               manifestPresetTurn=job['state']['turn'] if preset else None,
                               metadataEvidence='固定catalog+manifest计划与实际原config，非文件名推测',
                               policyEligible=False, valueEligible=False, returnEligible=False)
                    output.write(json.dumps(row, ensure_ascii=False, separators=(',', ':')) + '\n')
                    for key, value in [('mode', row['configMode']), ('sourceMapPlayers', row['sourceMapPlayerCount']), ('configuredPlayers', row['configuredPlayerCount']), ('planKind', row['planKind']), ('artificialEndgame', str(endgame)), ('presetState', str(preset))]:
                        counters[key][value] += 1
                    count += 1
            after = archive.stat()
            if seen != set(group) or before.st_size != after.st_size or before.st_mtime_ns != after.st_mtime_ns:
                raise RuntimeError('归档配置数量或读取期身份变化')
            output.flush()
            print(json.dumps({'bucketParents': count, 'seconds': round(time.monotonic()-start, 2)}), flush=True)
    finally:
        proc.stdin.close(); code = proc.wait(timeout=30); output.close()
        if code:
            raise RuntimeError('配置解码器异常退出')
    if count != 3000:
        raise RuntimeError('分桶数量不为3000')
    source_paths = [SNAPSHOT / name for name in ['00_dataset-3000-index.json', '01_manifest.json', '02_manifest.json']]
    source_paths += [HERE / 'parent-outcomes.jsonl', HERE / 'build_buckets.py', HERE / 'decode_bucket_config.ts']
    result = dict(passed=True, parents=count, counts={k: dict(v) for k, v in counters.items()}, seconds=round(time.monotonic()-start, 3),
                  sourceSha256={str(p.relative_to(ROOT)).replace('\\', '/'): hashlib.sha256(p.read_bytes()).hexdigest() for p in source_paths},
                  parentBucketsSha256=hashlib.sha256((HERE / 'parent-buckets.jsonl').read_bytes()).hexdigest(),
                  allTrainingEligibilityFalse=True)
    (HERE / 'bucket-summary.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
    if sum(p.stat().st_size for p in HERE.rglob('*') if p.is_file()) > 10 * 1024 * 1024:
        raise RuntimeError('研究输出超过10MiB')
    print(json.dumps(result, ensure_ascii=False), flush=True)


if __name__ == '__main__':
    main()
