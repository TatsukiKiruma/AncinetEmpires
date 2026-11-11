"""只读盘点原件、旧收据和压缩样本，不执行游戏或训练。"""
import collections
import gzip
import hashlib
import json
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = Path(__file__).resolve().parent

def read(path):
    return json.loads(Path(path).read_text(encoding='utf-8-sig'))

def sha(path):
    h = hashlib.sha256()
    with Path(path).open('rb') as f:
        for block in iter(lambda: f.read(1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()

def rel(path):
    return Path(path).resolve().relative_to(ROOT).as_posix()

def save(name, data):
    (OUT / name).write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf8')

checks = []
def check(path, expected=None, scope='evidence'):
    p = Path(path)
    if not p.is_absolute():
        p = ROOT / p
    row = {'path': rel(p), 'scope': scope, 'exists': p.is_file(), 'expectedSha256': expected}
    if p.is_file():
        row.update(bytes=p.stat().st_size, sha256=sha(p))
        row['matches'] = expected is None or row['sha256'] == expected
    else:
        row['matches'] = False
    checks.append(row)
    return row

def walk_files(root):
    for parent, dirs, files in os.walk(root, followlinks=False):
        dirs[:] = [d for d in dirs if d not in {'.git', 'node_modules', '__pycache__'}
                   and not (Path(parent) / d).is_symlink()
                   and not (hasattr(os.path, 'isjunction') and os.path.isjunction(Path(parent) / d))]
        for name in files:
            yield Path(parent) / name

def main():
    allfiles = list(walk_files(ROOT / 'captures')) + list(walk_files(ROOT / 'ai_training'))
    raw = [p for p in allfiles if p.name.startswith('game_get_') and p.suffix == '.bin']
    reports = [p for p in allfiles if p.name == 'download_report.json']
    groups = {}
    paths = {}
    for p in raw:
        h = sha(p)
        row = groups.setdefault(h, {'sha256': h, 'bytes': p.stat().st_size, 'paths': [], 'bindings': []})
        row['paths'].append(rel(p)); paths[p.resolve()] = row
    invalid = []
    for p in reports:
        d = read(p)
        for e in d.get('downloads', []):
            if not isinstance(e, dict) or not isinstance(e.get('file'), str):
                continue
            target = (p.parent / e['file']).resolve()
            if target not in paths:
                continue
            row = paths[target]; host = d.get('host'); api = e.get('id')
            api_hash = hashlib.sha256(str(api).encode()).hexdigest()
            valid_names = [f'game_get_{api_hash[:24]}.bin', f'game_get_{api_hash[:24]}_{row["sha256"][:24]}.bin']
            valid = host and isinstance(api, str) and e.get('sha256') == row['sha256'] and e.get('bytes') == row['bytes'] and target.name in valid_names
            if valid:
                binding = {'host': host.lower(), 'apiIdHash': api_hash, 'metadata': rel(p), 'metadataSha256': sha(p)}
                if binding not in row['bindings']: row['bindings'].append(binding)
            else:
                invalid.append({'report': rel(p), 'file': rel(target)})
    save('raw-responses.json', list(groups.values()))
    save('scan-scope.json', {'roots': ['captures', 'ai_training'], 'filesVisited': len(allfiles), 'rawPaths': len(raw),
         'directoriesSkipped': '目录联接、符号链接、node_modules、.git、__pycache__；避免支持链接重复遍历',
         'archives': [{'path': rel(p), 'bytes': p.stat().st_size} for p in allfiles if p.name.endswith(('.zip','.tar','.tar.gz','.tgz','.7z'))],
         'invalidDownloadBindings': invalid})
    old = read(ROOT / 'ai_training/data_acceptance_20261016/replay/manifest.json')['inputs']
    hist = read(ROOT / 'ai_training/pretrain_preflight_20261022/human/runs/2026-10-21T20-25-12-770Z/history-inventory.json')['responses']
    new = read(ROOT / 'ai_training/dual_stream_v2_phase3_20261020/new_replays/manifest.json')['inputs']
    prefix = read(ROOT / 'ai_training/pretrain_preflight_20261022/HUMAN_DATA_INDEX.json')
    last = read(ROOT / 'captures/human-replay-audit-20261025-hardai/audit.json')['items']
    sets = {'old257': {r['sha256'] for r in old}, 'history302': {r['sha256'] for r in hist},
            'phase3_41': {r['sha256'] for r in new}, 'prefix3': {r['responseSha256'] for r in prefix['items']},
            'latest39': {r['sha256'] for r in last}}
    for rows in [old, hist, new]:
        for r in rows:
            for p in r.get('paths', [r.get('file')]): check(p, r['sha256'], 'raw_historical')
    for r in last: check(r['file'], r['sha256'], 'raw_latest')
    cross = {a: {b: len(s & t) for b,t in sets.items()} for a,s in sets.items()}
    save('batch-overlap.json', {'counts': {k:len(v) for k,v in sets.items()}, 'intersections': cross,
         'latestNovelVersusHistoryAndPrefix': sorted(sets['latest39'] - sets['history302'] - sets['prefix3']),
         'rawNotInKnownBatches': sorted(set(groups)-set.union(*sets.values())),
         'historicalMissingAllPaths': [r['sha256'] for r in hist if r['sha256'] not in groups]})
    # 每份旧包逐行读取，只核对保存的字段和控制者，不执行动作。
    packets = []
    split = read(ROOT / 'ai_training/dual_stream_v2_phase3_20261020/split-manifest-v2-stage3.json')
    parent_splits = {p['id']:p for p in split['parents'] if p['source'] != 'native'}
    release = read(ROOT / 'ai_training/data_acceptance_20261016/replay/policy-release-index.json')
    expected_packets = {r['responseSha256']: r['packet'] for r in release['candidateSources']}
    expected_packets.update({r['responseSha256']: r['packet'] for r in split['newReplayEntries']})
    for batch, directory in [('old255','ai_training/data_acceptance_20261016/replay/accepted'), ('phase3_41','ai_training/dual_stream_v2_phase3_20261020/new_replays/accepted')]:
        for p in sorted((ROOT / directory).glob('*.jsonl.gz')):
            exp = expected_packets.get(p.stem.removesuffix('.jsonl'), {})
            c = check(p, exp.get('sha256'), 'accepted_packet')
            counts = collections.Counter(); controller = collections.Counter(); state_hashes = set(); header = None
            with gzip.open(p, 'rt', encoding='utf8') as f:
                for line in f:
                    d = json.loads(line); counts['lines'] += 1; counts[d.get('kind','unknown')] += 1
                    if d.get('kind') == 'game': header = d
                    if d.get('kind') != 'atomic': continue
                    labels = d.get('labels', {})
                    counts['valueEnabled'] += bool(labels.get('valueMask'))
                    if labels.get('policyMask') and d['action']['type'] != 'surrender':
                        counts['policy'] += 1; controller[str(d.get('controller',{}).get('type'))] += 1
                        counts['nontrivialPolicy'] += d.get('candidateCount',0) > 1
                        state_hashes.add(d.get('beforeHash'))
            h = header['responseSha256']; partition = parent_splits.get(h, {})
            packets.append({'batch': batch, 'responseSha256': h, 'path': rel(p), 'sha256':c['sha256'], 'matches':c['matches'],
                'counts':dict(counts), 'policyByController':dict(controller), 'uniqueBeforeHash':len(state_hashes),
                'configuredPlayers':len(header['activePlayers']), 'scenario':header['scenario'], 'playerTypes':header['playerTypes'],
                'initialStatePresent':bool(header.get('initialState')), 'rawActionIdentity':header['rawActionIdentity'],
                'splitRecord':partition, 'packetExpectedLines':exp.get('lines')})
    save('accepted-packets.json', packets)
    final = read(ROOT / 'ai_training/pretrain_preflight_20261022/HUMAN_DATA_INDEX_FINAL.json')
    for obj in [final['originalEvidenceIndexUnmodified'],final['finalExclusionReceipt'],final['dataSplits'],*final['policyFiles'].values()]:
        check(obj['path'],obj['sha256'],'prefix_final')
    admitted = []
    with gzip.open(final['policyFiles']['admitted']['path'],'rt',encoding='utf8') as f:
        admitted = [json.loads(line) for line in f]
    for r in prefix['selectedPrefixPolicySources']:
        check(r['packet']['path'],r['packet']['sha256'],'prefix_packet')
    campaign_root = ROOT / 'captures/campaign-replays-20261025'
    campaign = read(campaign_root / 'replay-audit.json')
    candidates = read(ROOT / 'captures/campaign-training-analysis-20261025/training-source-candidates.json')
    quality = {r['id']:{**r,'priority':tier} for tier,rows in candidates['groups'].items() for r in rows}
    campaign_rows = []
    for r in campaign:
        assets = [check(campaign_root/r[k],r[h],'campaign_asset') for k,h in [('file','sha256'),('objectFile','objectSha256'),('wtFile','wtSha256')]]
        assets.append(check(campaign_root/r['action']['file'],r['action']['sha256'],'campaign_asset'))
        q=quality[r['id']]
        campaign_rows.append({k:q.get(k) for k in ['id','campaign','stageNumber','seed','originalSeedAvailable','records','priority','canonicalMacroHash','prefix8Hash','prefix20Hash','author','lowerImportEffortCandidate','postStartMutationCategories','mapResourceSha256','scriptResourceSha256']} | {'allAssetsMatch':all(a['matches'] for a in assets),'historicalNativePassed':r['native']['passed'],'policyReady':False,'valueReady':False})
    save('campaign-ledger.json',campaign_rows)
    for filename,expected in candidates['sourceIdentity'].items():
        check(ROOT/'captures/campaign-training-analysis-20261025'/filename,expected,'campaign_analysis')
    for p in allfiles:
        if p.name in {'AGENTS.md','REPORT.md','HUMAN_DATA_INDEX_FINAL.json','CURRENT.md','PROTOCOL.json'} and ('human' in p.as_posix() or 'campaign' in p.as_posix()):check(p,scope='report_identity')
    save('file-checks.json',checks)
    sums = {}
    for batch in ['old255','phase3_41']:
        rows=[r for r in packets if r['batch']==batch]
        sums[batch]={'packets':len(rows),'policy':sum(r['counts'].get('policy',0) for r in rows),'human':sum(r['policyByController'].get('1',0) for r in rows), 'ai':sum(r['policyByController'].get('2',0) for r in rows),'value':sum(r['counts']['valueEnabled'] for r in rows),'modes':dict(collections.Counter(r['scenario'] for r in rows)),'players':dict(collections.Counter(r['configuredPlayers'] for r in rows))}
    summary={'staticOnly':True,'replayExecutions':0,'optimizerUpdates':0,'rawPaths':len(raw),'rawUnique':len(groups),'verifiedApiBindings':len({(b['host'],b['apiIdHash']) for r in groups.values() for b in r['bindings']}),'unboundResponses':sum(not r['bindings'] for r in groups.values()),'batches':sums,'prefix':{'admitted':len(admitted),'human':sum(r['humanController'] for r in admitted),'valueEnabled':sum(r['valueMask'] for r in admitted)},'campaign':{'responses':len(campaign_rows),'records':sum(r['records'] for r in campaign_rows),'uniqueActionHashes':len({r['action']['sha256'] for r in campaign}),'stages':len({(r['campaign'],r['stageNumber']) for r in campaign_rows})},'checks':{'total':len(checks),'missing':sum(not c['exists'] for c in checks),'mismatch':sum(c['exists'] and not c['matches'] for c in checks)}}
    save('SUMMARY.json',summary)
    print(json.dumps(summary,ensure_ascii=True,indent=2))

if __name__ == '__main__':
    main()
