"""单进程顺序评测与逐组独立strict；恢复时只跳过完整已有结果。"""
from pathlib import Path
import json, os, hashlib, subprocess, datetime, gzip

TASK = Path(__file__).resolve().parent
ROOT = TASK.parents[1]
OUT = TASK / 'evaluation'
read = lambda p: json.loads(Path(p).read_text(encoding='utf8'))
sha = lambda b: hashlib.sha256(b).hexdigest()
PLAN = read(TASK / 'EVALUATION_SPLITS.json')

def save(name, value):
    (OUT / name).write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding='utf8')

def run(command, log, env=None):
    print(json.dumps({'event': 'command', 'command': command, 'log': str(log)}, ensure_ascii=False), flush=True)
    with log.open('ab') as stream:
        process = subprocess.run(command, cwd=ROOT, stdout=stream, stderr=subprocess.STDOUT, env=env)
    if process.returncode:
        raise RuntimeError(f'命令失败，退出码{process.returncode}；日志{log}')

def verify(source, destination):
    if (destination / 'independent-strict-replay.json').exists():
        receipt = read(destination / 'independent-strict-replay.json')
        assert receipt['passed'] and receipt['summarySha256'] == sha((source / 'summary.json').read_bytes())
        assert all(sha((source / asset['path']).read_bytes()) == asset['sha256'] for asset in receipt['evidence'])
        assert sha(gzip.decompress((destination / 'consumed-canonical-rule-states.txt.gz').read_bytes())) == receipt['canonicalHash']['plainSha256']
        return
    destination.mkdir(parents=True, exist_ok=True)
    run(['node', 'ai_training/run.mjs', 'node', '--import', 'tsx', 'pretrain_preflight_20261022/verify.ts', str(source), str(destination)], destination / 'verify.log')

def reuse(identifier, relative):
    source, destination = ROOT / relative, OUT / 'reused' / identifier
    identity = read(source / 'identity.json')
    config = next(c for c in PLAN['candidates'] if c['id'] == identifier)
    checked = []
    for asset in identity['sourceManifest']['files']:
        if asset['path'].startswith('src/'):
            assert sha((ROOT / asset['path']).read_bytes()) == asset['sha256'], f"历史依赖不一致：{asset['path']}"
            checked.append(asset)
    assert checked
    for asset in config['assets']:
        old = next(a for a in identity['assets'] if a['path'] == asset['path'])
        assert old['sha256'] == asset['sha256']
    assert identity['searchOptions'] == PLAN['searchOptions']
    assert all(identity[k] == PLAN[k] for k in ['maxSteps', 'maxRounds', 'maxWallMs'])
    summary = read(source / 'summary.json')
    assert len(summary['games']) == 10 and summary['sourceUnchanged'] and summary['modelArtifactsUnchanged']
    for index, game in enumerate(summary['games']):
        assert game['mapName'] == PLAN['standard']['maps'][index // 2]
        assert game['seat'] == index % 2
        assert game['seed'] == PLAN['standard']['seedBase'] + index // 2 * 100 + index % 2 * 1009
    destination.mkdir(parents=True, exist_ok=True)
    receipt = {'candidate': identifier, 'source': relative, 'identitySha256': sha((source / 'identity.json').read_bytes()),
               'summarySha256': sha((source / 'summary.json').read_bytes()), 'runtimeFiles': checked, 'modelAssets': config['assets'],
               'passed': True, 'scope': '源码与模型组合相同；历史时延原样报告，并非本次新墙钟测量。'}
    receiptPath = destination / 'reuse-identity.json'
    if receiptPath.exists():
        assert read(receiptPath) == receipt
    else:
        receiptPath.write_text(json.dumps(receipt, ensure_ascii=False, indent=2), encoding='utf8')
    verify(source, destination)
    return summary

def arena(identifier, panel):
    parent = OUT / panel
    attempts = [parent / identifier] + sorted(parent.glob(identifier + '-attempt*'))
    complete = [p for p in attempts if (p / 'summary.json').exists()]
    if complete:
        destination = complete[-1]
    else:
        destination = attempts[-1]
        if (destination / 'started.json').exists():
            number = 2
            while (parent / f'{identifier}-attempt{number:02d}').exists():
                number += 1
            destination = parent / f'{identifier}-attempt{number:02d}'
    if not (destination / 'summary.json').exists():
        destination.mkdir(parents=True, exist_ok=True)
        env = dict(os.environ, EVAL_CANDIDATE=identifier, EVAL_PANEL=panel, EVAL_OUTPUT=str(destination))
        run(['node', 'ai_training/run.mjs', 'node', '--expose-gc', '--import', 'tsx', 'pretrain_preflight_20261022/arena.ts'], destination / 'arena.log', env)
    verify(destination, destination)
    indexFile = OUT / 'run-locations.json'
    index = read(indexFile) if indexFile.exists() else {}
    index[f'{panel}/{identifier}'] = destination.relative_to(ROOT).as_posix()
    save('run-locations.json', index)
    return read(destination / 'summary.json')

def main():
    summaries = {}
    for candidate in PLAN['candidates']:
        identifier = candidate['id']
        save('progress.json', {'phase': 'standard', 'activeCandidate': identifier, 'completed': list(summaries), 'updatedAt': datetime.datetime.now(datetime.timezone.utc).isoformat()})
        summaries[identifier] = reuse(identifier, PLAN['historicalReuse'][identifier]) if identifier in PLAN['historicalReuse'] else arena(identifier, 'standard')
        print(json.dumps({'event': 'standard-complete', 'candidate': identifier, 'wins': summaries[identifier]['wins'], 'losses': summaries[identifier]['losses']}), flush=True)
    distinct = sorted({s['wins'] for s in summaries.values()}, reverse=True)
    first = [k for k, s in summaries.items() if s['wins'] == distinct[0]]
    selected = first if len(first) > 1 else [k for k, s in summaries.items() if s['wins'] in distinct[:2]]
    selection = {'standard': {k: {'wins': s['wins'], 'losses': s['losses'], 'truncated': s['truncated'], 'errors': s['errors']} for k, s in summaries.items()}, 'selected': selected, 'rule': PLAN['extension']['selection']}
    if (OUT / 'extension-selection.json').exists():
        assert read(OUT / 'extension-selection.json') == selection
    else:
        save('extension-selection.json', selection)
    extended = {}
    for identifier in selected:
        save('progress.json', {'phase': 'extension', 'activeCandidate': identifier, 'standardComplete': list(summaries), 'completed': list(extended)})
        extended[identifier] = arena(identifier, 'extension')
        print(json.dumps({'event': 'extension-complete', 'candidate': identifier, 'wins': extended[identifier]['wins'], 'losses': extended[identifier]['losses']}), flush=True)
    save('progress.json', {'phase': 'complete', 'standardComplete': list(summaries), 'extensionComplete': list(extended), 'completedAt': datetime.datetime.now(datetime.timezone.utc).isoformat()})

if __name__ == '__main__':
    main()
