"""核对报告依赖、建议预算和静态派生数字，不运行任何模型或游戏。"""
import hashlib
import json
from pathlib import Path

OUT = Path(__file__).resolve().parent
ROOT = OUT.parents[1]
BASE = ROOT / 'ai_training'

def read(path):
    return json.loads(path.read_text(encoding='utf-8-sig'))

def sha(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()

def write(name, data):
    (OUT / name).write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf8')

facts = read(OUT / 'STATIC_FINDINGS.json')
proposal = read(OUT / 'PROPOSAL.json')
sources = facts['admittedSources']
assert sum(x['rows'] for x in sources.values()) == 613
assert sum(x['macroCount'] for x in sources.values()) == 344
assert sum(x['incompleteMacroCount'] for x in sources.values()) == 2
assert abs(sum(x['weight'] for x in sources.values()) - 343) < 1e-9
assert len({h for x in sources.values() for h in x['historicalHumanControllerIdHashes']}) == 4
assert facts['pools']['dev']['players'].get('2', 0) == 0
assert sum(x['rows'] for x in facts['pools'].values()) == 116593
assert proposal['baseline']['sha256'] == facts['baseline']['sha256']
assert not proposal['execute'] and not proposal['executionAuthorized']
micro = proposal['optionalMicroExperiment']
counts = micro['humanSelection']['sourceMacroCounts']
assert sum(counts.values()) == micro['arms']['B']['updates'] == 96
assert all(counts[k] <= sources[k]['macroCount'] - sources[k]['incompleteMacroCount'] for k in counts)
assert micro['arms']['A']['updates'] + micro['arms']['B']['updates'] == 192
assert abs(facts['baseline']['schedulerNextLearningRate2414'] - proposal['baseline']['originalSchedulerNextLearningRate']) < 1e-15

ledger = {x['responseSha256']: x for x in read(BASE / 'human_data_inventory_20261027/multiplayer-ledger.json')}
two_player = []
for x in read(BASE / 'human_2m_conversion_20261027/CONVERSION.json')['reports']:
    if ledger[x['sourceId']]['activePlayers'] == 2:
        two_player.append({**{k: x.get(k, 0) for k in ['sourceId', 'split', 'convertedRows', 'pendingRows', 'devRows', 'stateIdentityPendingRows', 'excludedRows']},
                           'mode': ledger[x['sourceId']]['scenario']})
assert sum(x['pendingRows'] for x in two_player if x['mode'] == 'SD') == 372
assert sum(x['pendingRows'] for x in two_player if x['mode'] == 'SO') == 246
write('TWO_PLAYER_DETAIL.json', two_player)

identities = read(OUT / 'INPUT_IDENTITY.json')
checks = [{'path': x['path'], 'matches': sha(ROOT / x['path']) == x['sha256']} for x in identities['files']]
assert all(x['matches'] for x in checks)
conversion_source = read(BASE / 'human_2m_conversion_20261027/IDENTITY.json')['source']
code_checks = [{'path': p, 'expectedSha256': h, 'actualSha256': sha(ROOT / p)} for p,h in conversion_source.items()]
assert all(x['expectedSha256'] == x['actualSha256'] for x in code_checks)
extra_paths = [BASE / 'phone_2m_continue414_20261027' / x for x in ['train_continue.py','workers_runtime.py','train_phone.py','model.py','PROTOCOL.json']]
extra_paths += [BASE / 'data_acceptance_20261016/replay/core.ts', ROOT / 'src/ai_runtime/dual_v3/search_policy.ts']
write('VALIDATION.json', {'passed': True, 'checks': checks, 'conversionSourceIdentityChecks': code_checks,
    'additionalReadCodeIdentity': [{'path': str(p.relative_to(ROOT)), 'sha256': sha(p)} for p in extra_paths],
    'countsAndProposalArithmeticChecked': True, 'twoPlayerSDPendingRows': 372, 'twoPlayerSOPendingRows': 246,
    'modelExecuted': False, 'gameExecuted': False, 'phoneTouched': False,
    'notRun': ['公共lint/test/build', '训练工作区测试', '模型前向', '训练', '对局', '重放', '手机作业']})
files = [p for p in sorted(OUT.iterdir()) if p.is_file() and p.name != 'DELIVERY_MANIFEST.json']
write('DELIVERY_MANIFEST.json', {'files': [{'path': p.name, 'bytes': p.stat().st_size, 'sha256': sha(p)} for p in files],
    'scope': '仅本报告目录；不含原始数据或模型副本'})
print(json.dumps({'passed': True, 'inputFilesRechecked': len(checks), 'conversionCodeFilesMatched': len(code_checks),
                  'outputFiles': len(files), 'optimizerUpdates': 0, 'gameActions': 0}, ensure_ascii=False))
