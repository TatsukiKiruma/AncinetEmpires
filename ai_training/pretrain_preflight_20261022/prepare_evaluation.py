"""冻结候选配套资产并预登记同条件评测；不训练或修改历史目录。"""
from pathlib import Path
import json, hashlib, shutil

ROOT = Path(__file__).resolve().parents[2]
TASK = Path(__file__).resolve().parent
OUT = TASK / 'evaluation'
read = lambda p: json.loads(Path(p).read_text(encoding='utf8'))
sha = lambda b: hashlib.sha256(b).hexdigest()

def main():
    assert not (TASK / 'EVALUATION_SPLITS.json').exists(), '预登记已存在，禁止覆盖'
    OUT.mkdir(exist_ok=True)
    candidates = []
    for identifier, directory in [
        *[(f'phase5-gen0{i}', f'ai_training/dual_stream_v2_phase5_20261020/generations/gen_0{i}') for i in range(5)],
        ('other-gen02', 'ai_training/dual_stream_v2_gen02_20261021/generations/gen_02'),
        ('phase6-gen05', 'ai_training/dual_stream_v2_phase6_20261022/gen_05')]:
        source = ROOT / directory
        destination = OUT / 'assets' / identifier
        destination.mkdir(parents=True, exist_ok=False)
        names = ['model.json', 'model.bin', 'head-calibration.json', 'value-config.json']
        config = read(source / 'value-config.json')
        if config.get('parentMixture', 0) > 0:
            names += ['parent-model.json', 'parent-model.bin']
            assert sha((source / 'parent-model.bin').read_bytes()) == config['parentModelSha256']
        assets = []
        for name in names:
            content = (source / name).read_bytes()
            (destination / name).write_bytes(content)
            assets.append({'path': (source / name).relative_to(ROOT).as_posix(), 'name': name, 'sha256': sha(content), 'bytes': len(content)})
        candidates.append({'id': identifier, 'source': directory, 'frozen': destination.relative_to(ROOT).as_posix(),
                           'modelSha256': sha((source / 'model.bin').read_bytes()), 'assets': assets,
                           'parentMixture': config.get('parentMixture', 0), 'parentModelSha256': config.get('parentModelSha256')})
    stage3 = ROOT / 'ai_training/dual_stream_v2_phase3_20261020/dual-v2-stage3-pure.bin'
    assert sha(stage3.read_bytes()) == candidates[0]['modelSha256']
    protocol = read(ROOT / 'ai_training/dual_stream_v2_phase6_20261022/protocol.json')
    plan = {'registeredAt': __import__('datetime').datetime.now(__import__('datetime').timezone.utc).isoformat(),
            'opponent': 'Original-APKlikeAI-Hard', 'runtimeRevision': 'current-v6r3', 'mode': 'search',
            'searchOptions': protocol['searchOptions'], 'decisionLimitMs': 1000,
            'maxSteps': 4000, 'maxRounds': 120, 'maxWallMs': 600000, 'sequential': True,
            'standard': {'maps': ['(2) Duel.aem', '(2) Crossed swords.aem', '(2) Mourningstar.aem', '(2) Liberty Port.aem', '(2) The Crossing.aem'],
                         'seats': [0, 1], 'goldDelta': 0, 'seedBase': 20261021, 'seedFormula': 'seedBase + mapIndex*100 + seat*1009；对手流再加hardPlayer*1009'},
            'extension': {'maps': ['(2) Icy Paths.aem', '(2) Peak Island.aem', '(2) Swamplands.aem'],
                          'seats': [0, 1], 'goldDelta': 100, 'seedBase': 2026102200,
                          'selection': '标准自然胜场最高的全部并列候选；若只有一名第一，再包括自然胜场第二的全部并列候选。截断/错误不算胜。',
                          'scope': '官方图已用于开发；新金币开局及随机种子预登记，不称独立盲测。'},
            'candidates': candidates,
            'duplicateWeights': [{'omitted': 'phase3', 'representative': 'phase5-gen00', 'sha256': candidates[0]['modelSha256'],
                                  'reason': '权重完全相同；阶段3旧纯策略和外置校准是不同策略组合，不作独立权重代际重复。当前统一搜索采用第0代完整配套校准。'}],
            'historicalReuse': {'phase5-gen03': 'deliverables/trained_vs_apk_hard_20261022/phase61-v6r3-hard-slayer',
                                'phase6-gen05': 'deliverables/trained_vs_apk_hard_20261022/gen05-v6-hard-slayer'},
            'reuseConditions': '全部src依赖及配套模型资产SHA匹配当前；相同选项/种子/上限；另存独立strict重放及canonical规则态排重收据。',
            'interpretation': '比较完整策略组合；headBias/value-config/父价值依赖不全相同时，不把差异全部归于model.bin。'}
    (TASK / 'EVALUATION_SPLITS.json').write_text(json.dumps(plan, ensure_ascii=False, indent=2), encoding='utf8')
    print(json.dumps({'candidates': len(candidates), 'newStandardGames': 50, 'historicalGames': 20, 'planSha256': sha((TASK/'EVALUATION_SPLITS.json').read_bytes())}))

if __name__ == '__main__':
    main()
