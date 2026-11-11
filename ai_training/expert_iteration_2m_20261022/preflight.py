"""按交接清单核验真实产物，并为本轮登记独立身份与实验协议。"""
import hashlib
import json
import subprocess
from datetime import datetime, timezone
from pathlib import Path

DIR = Path(__file__).resolve().parent
ROOT = DIR.parents[1]
PRE = DIR.parent / 'pretrain_preflight_20261022'


def read(p):
    return json.loads(p.read_text('utf-8-sig'))


def sha(p):
    h = hashlib.sha256()
    with p.open('rb') as f:
        for block in iter(lambda: f.read(4 * 1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()


def save(name, value):
    p = DIR / name
    assert not p.exists(), f'拒绝覆盖：{p}'
    p.write_text(json.dumps(value, ensure_ascii=False, indent=2), 'utf-8')


def main():
    save('started.json', dict(at=datetime.now(timezone.utc).isoformat(), status='engineering_in_progress', generationsCompleted=0, sampledParents=0, finalEvaluationGames=0))
    result = subprocess.run(['git', 'status', '--short'], cwd=ROOT, capture_output=True)
    (DIR / 'git-status-before.txt').write_bytes(result.stdout)
    manifest = read(PRE / 'DELIVERY_MANIFEST.json')
    errors = []
    for item in manifest['files']:
        p = Path(item['path'])
        if not p.exists() or sha(p) != item['sha256']:
            errors.append(str(p))
    splits = read(PRE / 'DATA_SPLITS.json')
    for item in splits['exclusionIndexes']:
        p = Path(item['path'])
        if not p.exists() or sha(p) != item['sha256']:
            errors.append(str(p))
    human = read(PRE / 'HUMAN_DATA_INDEX_FINAL.json')
    for item in human['policyFiles'].values():
        p = Path(item['path'])
        if not p.exists() or sha(p) != item['sha256']:
            errors.append(str(p))
    hard = read(PRE / 'HARD_3000_MANIFEST.json')
    save('preflight-audit.json', dict(filesChecked=manifest['fileCount'], indexesChecked=len(splits['exclusionIndexes']), errors=errors,
         passed=not errors, hardNativeAccepted=hard['project_strict_accepted_parents'], hardNativeReady=hard['acceptance_passed'],
         humanPolicy=human['admittedPolicyActions'], humanValue=human['reliableNaturalTerminalParents'],
         preflightManifestSha256=sha(PRE / 'DELIVERY_MANIFEST.json'), dataSplitsSha256=sha(PRE / 'DATA_SPLITS.json'),
         inheritedMissingWork=manifest['uncompletedWork'], preservation=read(PRE / 'ASSET_PRESERVATION_RESULT.json'),
         cleanup=read(PRE / 'CLEANUP_RESULT.json')))
    assert not errors, errors
    maps = ['(2) Duel.aem', '(2) Crossed swords.aem', '(2) Mourningstar.aem', '(2) Liberty Port.aem', '(2) The Crossing.aem', '(2) Icy Paths.aem', '(2) Peak Island.aem', '(2) Lost City.aem']
    plan = []
    for generation in range(1, 4):
        for i in range(200):
            plan.append(dict(id=f'g{generation}-{i:03}', generation=generation, split='train', map=maps[i % len(maps)], seat=i % 2,
                             opponent='Original-APKlikeAI-Hard' if i < 100 else 'self' if i % 2 else 'historical', seed=22100000+generation*10000+i,
                             openingLineage=f'g{generation}-family-{i//2:03}', budgetMs=4000, explorationTemperature=0))
    save('sampling-plan.json', plan)
    save('protocol.json', dict(schema='expert-iteration-2m-v1', externalOpponent='Original-APKlikeAI-Hard', nativeHardMissing=True,
         generations=3, parentsPerGeneration=200, hardFraction=.5, generationStopRule='连续两代无开发收益时诊断和有限修正，第三代后停止',
         search=dict(budgetMs=4000, rootCandidates=24, beamWidth=12, maxUnits=5, finalists=8, maxNodes=20000, responseVariants=2, responseUnits=8),
         concurrencyPilot=[2,4,8], maxGameSteps=4000, maxGameRounds=120, maxGameWallMs=20000000,
         comparisons=['old+frozen', 'old+new-1s','old+new-2s','old+new-4s','2m-pretrain+new-4s','2m-expert+new-4s'],
         ablations=['intermediate-value-on/off','post-response/pre-response-penalty'],
         policyTarget='只在实际完成比较的候选根动作上做分数softmax；未探索动作不设负标签，不伪造访问次数',
         valueTarget='只用可靠自然终局，包含双方全部阶段；截断及错误valueMask=false，平局单独标记',
         split='继承DATA_SPLITS；同父局、续段和开局谱系同区。已消费开发局仅回归，封存最终100局不得参与选择',
         initialization='新结构固定seed随机初始化；旧权重不直接载入新形状',
         checkpointSelection='开发集Policy+Value均衡目标最小；同分取早期。代际晋升按配对自然胜净增且无错误及strict失败',
         finalPlan=[dict(id=f'final-{i:03}', map=maps[i%len(maps)], seat=i%2, seed=99221000+i, openingLineage=f'final-family-{i//2:03}') for i in range(100)],
         finalStatus='尚未执行；同标准初态的seed差异不自动构成独立开局', guiDeployment=False))
    print(json.dumps(dict(passed=True, checked=manifest['fileCount'], hardNative=0, humanPolicy=human['admittedPolicyActions']), ensure_ascii=False))


if __name__ == '__main__':
    main()
