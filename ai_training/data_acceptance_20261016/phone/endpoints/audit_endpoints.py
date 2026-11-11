"""固定快照的端点/血缘审计：流读tar.gz，不落盘states，不执行对局。"""
import base64
import collections
import datetime
import gzip
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
OUTPUT_LIMIT = 10 * 1024 * 1024
MIN_FREE = 12 * 1024 ** 3


def sha(data):
    return hashlib.sha256(data).hexdigest()


def load(name):
    return json.loads((SNAPSHOT / name).read_text(encoding='utf-8'))


class HashReader:
    """一遍顺序读取同时计算源压缩文件SHA，不二次扫描归档。"""
    def __init__(self, handle):
        self.handle = handle
        self.digest = hashlib.sha256()

    def read(self, size=-1):
        data = self.handle.read(size)
        self.digest.update(data)
        return data


def main():
    started = time.monotonic()
    if shutil.disk_usage(ROOT).free < MIN_FREE:
        raise RuntimeError('C盘少于12GiB，仅停止自身')
    if (HERE / 'segment-receipts.jsonl').exists():
        raise RuntimeError('本输出已存在，拒绝覆盖验收证据')
    catalog, status, outcomes, summary = [load(name) for name in ['00_dataset-3000-index.json', '05_continuation-status.json', '06_continuation-outcomes.json', 'summary.json']]
    games = {row['id']: row for row in catalog['games']}
    if len(games) != 3000 or len(games) != len(catalog['games']):
        raise RuntimeError('原局ID数量或唯一性不符')
    specs = collections.OrderedDict()
    for row in catalog['games']:
        specs[row['id']] = dict(row, parentId=row['id'], kind='original', global_offset=0,
                                archivePath=(ROOT / 'captures/phone-compressed-2000-20261015' / row['archive']).resolve())
    for row in status['segments']:
        if row['id'] in specs or row['original_id'] not in games:
            raise RuntimeError('续跑ID重复或父局不存在')
        specs[row['id']] = dict(row, parentId=row['original_id'], kind='continuation',
                                archivePath=ROOT / 'captures/phone-continuation-61-20261015' / row['archive'])
    groups = collections.OrderedDict()
    for spec in specs.values():
        groups.setdefault(spec['archivePath'], {})[spec['id']] = spec
    identities = {}
    sources = [SNAPSHOT / name for name in ['00_dataset-3000-index.json', '05_continuation-status.json', '06_continuation-outcomes.json', '07_continuation-chain-verification.json', '08_stalemate-policy.json', 'summary.json']]
    sources += [HERE / 'audit_endpoints.py', HERE / 'decode_endpoints.ts', HERE.parent.parent / 'native_reader/reader.ts', HERE.parent.parent / 'native_reader/types.ts']
    for path in sources:
        identities[str(path.relative_to(ROOT)).replace('\\', '/')] = sha(path.read_bytes())
    source_id = sha(json.dumps(identities, sort_keys=True).encode())
    (HERE / 'source-identity.json').write_text(json.dumps({'sourceId': source_id, 'files': identities}, ensure_ascii=False, indent=2), encoding='utf-8')
    proc = subprocess.Popen(['node', '--import', 'tsx', str(HERE / 'decode_endpoints.ts')], cwd=ROOT,
                            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=(HERE / 'decoder-stderr.log').open('xb'))
    receipts = (HERE / 'segment-receipts.jsonl').open('x', encoding='utf-8', newline='\n')
    parents_out = (HERE / 'parent-outcomes.jsonl').open('x', encoding='utf-8', newline='\n')
    written = 0

    def emit(handle, row):
        nonlocal written
        line = json.dumps(row, ensure_ascii=False, separators=(',', ':')) + '\n'
        written += len(line.encode('utf-8'))
        if written > OUTPUT_LIMIT - 256000:
            raise RuntimeError('审计输出接近10MiB，仅停止自身')
        handle.write(line)

    seen, decoded_ends, parent_latest, parent_config, parent_errors = {}, {}, {}, {}, collections.defaultdict(list)
    archive_receipts = []
    error_counts = collections.Counter()
    original_actions = continuation_actions = 0
    processed = 0
    try:
        for archive, group in groups.items():
            if shutil.disk_usage(ROOT).free < MIN_FREE:
                raise RuntimeError('C盘少于12GiB，仅停止自身')
            before = archive.stat()
            files = collections.defaultdict(dict)
            action_info = {}
            archive_start = time.monotonic()
            with archive.open('rb') as raw:
                hashed = HashReader(raw)
                with gzip.GzipFile(fileobj=hashed, mode='rb') as outer:
                    with tarfile.open(fileobj=outer, mode='r|', bufsize=1024 * 1024) as tar:
                        for member in tar:
                            name = member.name.removeprefix('./')
                            ident, _, base = name.partition('/')
                            if ident not in group or not member.isfile():
                                continue
                            if base in ('config.bin', 'initial.bin', 'final.bin', 'result.json'):
                                if base in files[ident]:
                                    raise RuntimeError(f'重复成员{ident}/{base}')
                                if member.size > 2 * 1024 * 1024:
                                    raise RuntimeError('端点超过2MiB，拒绝读入')
                                files[ident][base] = tar.extractfile(member).read()
                            elif base in ('actions.jsonl', 'actions.jsonl.gz'):
                                if ident in action_info:
                                    raise RuntimeError('重复动作成员')
                                spec = group[ident]
                                reader = tar.extractfile(member)
                                stream = gzip.GzipFile(fileobj=reader, mode='rb') if base.endswith('.gz') else reader
                                count, errors, content_digest = 0, [], hashlib.sha256()
                                types = collections.Counter()
                                for line in stream:
                                    content_digest.update(line)
                                    if not line.strip():
                                        errors.append('动作流空行')
                                        continue
                                    action = json.loads(line)
                                    global_index = spec['global_offset'] + count
                                    if action.get('index') != count:
                                        errors.append('动作局部序号不连续')
                                    if spec['kind'] == 'continuation' and action.get('global_index') != global_index:
                                        errors.append('动作全局序号不连续')
                                    if action.get('ai_seed') != int(spec['seed']) + global_index * 104729:
                                        errors.append('动作AI种子不连续')
                                    types[action.get('fields', {}).get('j')] += 1
                                    count += 1
                                if base.endswith('.gz'):
                                    stream.close()
                                action_info[ident] = {'count': count, 'sha256': content_digest.hexdigest(), 'errors': sorted(set(errors)), 'types': dict(types)}
                    # 读到gzip尾部以触发CRC/ISIZE校验，并把源压缩字节纳入SHA。
                    while outer.read(1024 * 1024):
                        pass
                while hashed.read(1024 * 1024):
                    pass
                archive_sha = hashed.digest.hexdigest()
            after = archive.stat()
            if before.st_size != after.st_size or before.st_mtime_ns != after.st_mtime_ns:
                raise RuntimeError('读取期间归档身份变化')
            for ident, spec in group.items():
                errors = []
                payload = files.get(ident, {})
                missing = set(('config.bin', 'initial.bin', 'final.bin', 'result.json')) - set(payload)
                if missing or ident not in action_info:
                    raise RuntimeError(f'归档缺必需成员{ident}:{sorted(missing)}')
                result = json.loads(payload['result.json'])
                for key in ('id', 'map', 'seed', 'actions', 'natural_end', 'winner_mask'):
                    if result.get(key) != spec.get(key):
                        errors.append(f'结果与固定清单不符:{key}')
                info = action_info[ident]
                errors += info['errors']
                if info['count'] != spec['actions']:
                    errors.append('动作行数与清单不符')
                if spec['kind'] == 'continuation':
                    for key in ('original_id', 'global_offset', 'global_end', 'parent_id', 'parent_final_sha256', 'truncation_reason'):
                        if result.get(key) != spec.get(key):
                            errors.append(f'续跑结果与固定清单不符:{key}')
                    if info['types'] != result.get('action_types'):
                        errors.append('动作类型计数与结果不符')
                request = dict(id=ident, parentId=spec['parentId'], **{key: base64.b64encode(payload[key + '.bin']).decode() for key in ('config', 'initial', 'final')})
                proc.stdin.write((json.dumps(request, separators=(',', ':')) + '\n').encode()); proc.stdin.flush()
                response = proc.stdout.readline()
                if not response:
                    raise RuntimeError('原生解析子进程退出')
                decoded = json.loads(response)
                if not decoded.get('ok'):
                    raise RuntimeError(f'严格端点解析失败{ident}:{decoded.get("error")}')
                initial, final, cfg = decoded['initial'], decoded['final'], decoded['config']
                if int(cfg['seed']) != int(spec['seed']):
                    errors.append('配置seed与原局seed不符')
                for endpoint_name, endpoint in [('initial', initial), ('final', final)]:
                    for flag in ('configOriginalTypesEqual', 'configAlliancesEqual', 'configDefinitionsEqual', 'configRulesEqual'):
                        if not endpoint[flag]:
                            errors.append(f'{endpoint_name}:{flag}')
                    if endpoint['h'] >= 0 and not endpoint['naturalEndpointValid']:
                        errors.append(f'{endpoint_name}:自然结果不是唯一存活联盟')
                if (final['h'] >= 0) != bool(spec['natural_end']) or final['h'] != spec['winner_mask']:
                    errors.append('原生final.h与清单终局不符')
                parent_id = spec['parentId']
                previous = parent_latest.get(parent_id)
                if spec['kind'] == 'original':
                    if initial['h'] >= 0:
                        errors.append('原局初态已终局')
                    if initial['types'] != cfg['types']:
                        errors.append('原局初态当前队伍类型与config不符')
                    parent_config[parent_id] = cfg
                else:
                    if previous is None:
                        errors.append('续跑缺先行父段')
                    else:
                        if spec['parent_id'] != previous['id']:
                            errors.append('parent_id不等于实际前段')
                        if spec['global_offset'] != previous['globalEnd']:
                            errors.append('global_offset不连续')
                        if initial['sha256'] != previous['finalSha256']:
                            errors.append('前段final与本段initial SHA不等')
                        if spec['parent_final_sha256'] != previous['finalSha256']:
                            errors.append('parent_final_sha与前段final不符')
                        if previous['nativeH'] >= 0:
                            errors.append('自然终局之后仍续跑')
                    if initial['h'] >= 0:
                        errors.append('续跑初态已经自然终局')
                    if spec['global_end'] != spec['global_offset'] + info['count']:
                        errors.append('global_end不符')
                    if cfg['sha256'] != parent_config[parent_id]['sha256']:
                        errors.append('续跑配置与原config字节不同')
                    if result.get('initial_board_sha256') != initial['boardSha256'] or result.get('final_board_sha256') != final['boardSha256']:
                        errors.append('原生结果棋盘SHA不符')
                global_end = spec['global_offset'] + info['count']
                row = dict(id=ident, parentId=parent_id, kind=spec['kind'], archive=archive.name,
                           parentIdInResult=result.get('parent_id'), globalOffset=spec['global_offset'], globalEnd=global_end,
                           actions=info['count'], actionsSha256=info['sha256'], configSha256=cfg['sha256'],
                           initialSha256=initial['sha256'], finalSha256=final['sha256'],
                           nativeH=final['h'], aliveAlliances=final['aliveAlliances'], endpointAndLinkAccepted=not errors,
                           policyEligible=False, valueEligible=False, returnEligible=False, errors=sorted(set(errors)))
                emit(receipts, row)
                seen[ident] = row
                parent_latest[parent_id] = row
                decoded_ends[parent_id] = final
                parent_errors[parent_id] += row['errors']
                error_counts.update(row['errors'])
                processed += 1
                if spec['kind'] == 'original':
                    original_actions += info['count']
                else:
                    continuation_actions += info['count']
            archive_receipts.append(dict(archive=str(archive.relative_to(ROOT)).replace('\\', '/'), bytes=after.st_size, sha256=archive_sha, segments=len(group), seconds=round(time.monotonic() - archive_start, 3)))
            receipts.flush()
            print(json.dumps({'processed': processed, 'requested': len(specs), 'archive': archive.name, 'seconds': round(time.monotonic()-started, 2), 'errors': sum(error_counts.values()), 'outputBytes': written}), flush=True)
    finally:
        proc.stdin.close()
        code = proc.wait(timeout=30)
        receipts.close()
        if code:
            raise RuntimeError(f'端点解析器退出码{code}')
    overrides = {row['original_id']: row for row in outcomes['outcome_overrides']}
    running = set(outcomes['still_running'])
    natural_count = stopped_count = unresolved_count = 0
    for parent_id, game in games.items():
        latest, final, cfg = parent_latest[parent_id], decoded_ends[parent_id], parent_config[parent_id]
        expected = overrides.get(parent_id, game)
        errors = sorted(set(parent_errors[parent_id]))
        if parent_id in overrides:
            for field, actual in [('final_source', latest['id']), ('global_actions', latest['globalEnd'])]:
                if expected[field] != actual:
                    errors.append(f'最终覆盖记录不符:{field}')
        if bool(expected['natural_end']) != (final['h'] >= 0):
            errors.append('最终覆盖自然标志不符')
        if final['h'] >= 0 and expected['winner_mask'] != final['h']:
            errors.append('最终覆盖联盟不符')
        if parent_id == 's2466':
            outcome = 'confirmed_cyclic_stalemate'
            stopped_count += 1
            if final['h'] >= 0 or expected.get('outcome_label_eligible') is not False:
                errors.append('循环停止误作自然标签')
        elif final['h'] >= 0:
            outcome = 'natural_terminal'
            natural_count += 1
        else:
            outcome = 'unfinished_at_fixed_snapshot'
            unresolved_count += 1
            if parent_id not in running:
                errors.append('未结束局不在固定运行名单')
        active_teams = [i for i, kind in enumerate(cfg['types']) if kind not in (0, 5)]
        actor_labels = [{'team': team, 'alliance': cfg['alliances'][team], 'nativeOutcomeSign': (1 if cfg['alliances'][team] == final['h'] else -1) if outcome == 'natural_terminal' and not errors else None} for team in active_teams]
        row = dict(parentId=parent_id, map=game['map'], seed=game['seed'], finalSource=latest['id'],
                   configSha256=cfg['sha256'], finalSha256=latest['finalSha256'], globalActions=latest['globalEnd'],
                   outcome=outcome, nativeWinnerAlliance=final['h'] if final['h'] >= 0 else None,
                   endpointAndLineageAccepted=not errors, actorAllianceLabels=actor_labels,
                   policyEligible=False, valueEligible=False, returnEligible=False,
                   labelAuthority='原生联盟metadata，训练资格尚未释放，须合并TS转移验收',
                   errors=errors)
        emit(parents_out, row)
        error_counts.update(errors)
    parents_out.close()
    for path in sources:
        key = str(path.relative_to(ROOT)).replace('\\', '/')
        if sha(path.read_bytes()) != identities[key]:
            raise RuntimeError('运行期间本次审计源码/固定快照发生变化')
    report = dict(schema='native-endpoint-lineage-audit-v1', snapshot=SNAPSHOT.name, snapshotRound=status['round'],
                  snapshotObservedAt=summary['observed_at'], oldChainVerifiedRound=load('07_continuation-chain-verification.json')['checked_round'],
                  independentEndpointVerifiedRound=status['round'], requestedSegments=len(specs), processedSegments=processed,
                  originalParents=len(games), continuationSegments=len(status['segments']), originalActions=original_actions,
                  continuationActions=continuation_actions, totalActions=original_actions+continuation_actions,
                  naturalParents=natural_count, cyclicStoppedParents=stopped_count, unfinishedParents=unresolved_count,
                  allEndpointsAndLinksAccepted=not error_counts, errors=dict(error_counts), sourceId=source_id,
                  policyEligible=False, valueEligible=False, returnEligible=False,
                  scope='只校验端点/动作序号与种子/父段SHA链接/联盟结果，不解析中间states，不复跑规则，不发布训练资格',
                  archives=archive_receipts, bytesWrittenJsonl=written, seconds=round(time.monotonic()-started, 3),
                  diskFreeBytes=shutil.disk_usage(ROOT).free,
                  finishedAt=datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=8))).isoformat())
    (HERE / 'audit-summary.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    total = sum(path.stat().st_size for path in HERE.rglob('*') if path.is_file())
    if total > OUTPUT_LIMIT:
        raise RuntimeError('输出总量超过10MiB')
    print(json.dumps({k: v for k, v in report.items() if k != 'archives'}, ensure_ascii=False), flush=True)


if __name__ == '__main__':
    main()
