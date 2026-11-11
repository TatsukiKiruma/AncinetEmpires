import collections
import hashlib
import json
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent
TRAIN = ROOT.parent / 'sd64x3_phone_20261016'
BATTLE = ROOT.parent / 'sd64x3_phone_battles_20261016'


def read(path):
    return json.loads(path.read_text(encoding='utf-8'))


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


# 分析前后冻结交付均须保持原字节，不把诊断写入训练或对战目录。
preserved = {}
for folder in [TRAIN, BATTLE]:
    manifest = read(folder / 'DELIVERY_MANIFEST.json')
    for item in manifest['artifacts']:
        path = folder / item['path']
        assert path.stat().st_size == item['bytes'] and sha(path) == item['sha256'], path
    preserved[folder.name] = dict(files=len(manifest['artifacts']), manifestSha256=sha(folder / 'DELIVERY_MANIFEST.json'))

data = read(ROOT / 'analysis.json')
assert len(data['slots']) == 10
events = [event for slot in data['slots'] for event in slot['events']]
stats = {key: sum(slot['stats'][key] for slot in data['slots']) for key in data['slots'][0]['stats'] if isinstance(data['slots'][0]['stats'][key], int)}
probes = read(ROOT / 'counterfactual-probes.json')['results']
lethal_waits = [p for p in probes if p['kind'] == 'retreat' and p['chosen']['lethal']]
labels = read(ROOT / 'label-distribution.json')
summary = read(BATTLE / 'summary.json')
findings = dict(
    optimizerUpdates=0, newMatches=0, originalDeliveriesPreserved=preserved,
    replayModelDecisionsRecomputed=len(events), committedActions=summary['totalCommittedActions'],
    latency=summary['latency'], aggregate=stats,
    knownLethalWaits=sum(e['action']['type'] == 'wait' and bool(e['chosenTactic'][7]) for e in events),
    lethalWaitsWithLegalMove=len(lethal_waits),
    lethalWaitsWithZeroImmediateDamageMove=sum(bool(p['safeMoves']) for p in lethal_waits),
    skippedPositiveNetHpAttackWhileWaiting=sum(e['action']['type'] == 'wait' and bool(e['sameAvailable'].get('attack')) and e['bestByType']['attack']['tactic'][0] > e['bestByType']['attack']['tactic'][1] for e in events),
    recruitClasses={side: dict(collections.Counter(r['class'] for slot in data['slots'] for r in slot['recruits'] if r['side'] == side)) for side in ['model', 'heuristic']},
    passedRecruitOpportunities=len(read(ROOT / 'turn-pass-opportunities.json')),
    trainingLabelDistribution=labels,
    movingThreatExamples=[p for p in probes if p['kind'] == 'move_then_attack_blindspot'],
    notes=['可移动或可攻击不自动说明等待错误；反事实仅核对明确的即时后果，不证明替代动作最终胜利。', '安全移动指现有特征定义下的对手下一手立即攻击风险为零，仍可能被移动后攻击或集火。', '对手移动计数1542含15次post_attack_move；原报告move动作1527。', '训练目标是宏步展开动作的加权交叉熵；原生动作合法不等于最优，输方标签也不等于全部错误。', '未续训、未重赛、未改变原模型或预算；下一步建议尚未实施。'],
)
(ROOT / 'findings.json').write_text(json.dumps(findings, ensure_ascii=False, indent=2), encoding='utf-8')
artifacts = [dict(path=str(p.relative_to(ROOT)), bytes=p.stat().st_size, sha256=sha(p)) for p in sorted(ROOT.iterdir()) if p.is_file() and p.name != 'ANALYSIS_MANIFEST.json']
(ROOT / 'ANALYSIS_MANIFEST.json').write_text(json.dumps(dict(optimizerUpdates=0, artifacts=artifacts), ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps(dict(passed=True, modelDecisions=len(events), lethalWaitsWithSafeImmediateAlternative=findings['lethalWaitsWithZeroImmediateDamageMove'], preserved=preserved)))
