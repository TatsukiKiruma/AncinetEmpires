"""继承56槽初态与种子；每代纯策略和搜索共享槽位。"""
import hashlib
import json
import sys
import os
import subprocess
from pathlib import Path

folder = Path(__file__).resolve().parent
gen = int(sys.argv[1])
if gen == 3:
    audit = json.loads((folder / 'generations/gen_03/dev-policy-audit.json').read_text('utf-8'))
    assert audit['passed'], f"开发动作前检门禁未通过:{audit['gates']}"
    assert audit['modelSha256'] == hashlib.sha256((folder / 'generations/gen_03/model.bin').read_bytes()).hexdigest(), '前检收据必须绑定当前候选模型'
if gen == 2:
    quality = json.loads((folder / 'generations/gen_02/value-calibration.json').read_text('utf-8'))
    if not quality['passed']:
        raise RuntimeError('第2代价值16切片未通过，先保全本次校准并修复，暂不启动候选实战')
# 冻结当前运行时的第0代教师基线后，才允许观察学生面板战绩。
if gen > 0:
    baseline = folder / 'champion-search-arena'
    baseline.mkdir(exist_ok=True)
    if not (baseline / 'plan.json').exists():
        old = json.loads((folder / 'generations/gen_00/arena/plan.json').read_text('utf-8'))
        old.update(runtimeRevision='gen02-phase51', comparisonRole='同运行时第0代搜索教师，旧基线完整归档')
        (baseline / 'plan.json').write_text(json.dumps(old, ensure_ascii=False, indent=2), encoding='utf-8')
    if not (baseline / 'arena-summary.json').exists():
        procs = []; logs = []
        try:
            for lane in range(2):
                log = (baseline / f'lane-{lane}.log').open('ab'); logs.append(log)
                cmd = ['node', str(folder.parent / 'run.mjs'), 'node', '--import', 'tsx', 'dual_stream_v2_phase5_20261020/battle.ts', 'play', str(lane), '2']
                procs.append(subprocess.Popen(cmd, cwd=folder.parents[1], env={**os.environ, 'LEAGUE_ARENA': 'champion-search-arena'}, stdout=log, stderr=subprocess.STDOUT))
            codes = [p.wait() for p in procs]
            assert not any(codes), f'同运行时教师基线未完成:{codes}'
        finally:
            for log in logs: log.close()
        from arena_summary import summarize
        summarize(0, arena_path='champion-search-arena')
target = folder / f'generations/gen_{gen:02d}/arena/plan.json'
if target.exists():
    raise SystemExit(0)
old = json.loads((folder.parent / 'dual_stream_v2_phase4_20261020/battle-plan.json').read_text('utf-8'))
slots = []
for mode in (['turn_search'] if gen == 0 else ['pure', 'turn_search']):
    for row in old['slots']:
        if row['model'] != 'dual_v2_stage4_turn_search': continue
        name = f'dual_v2_gen{gen}_{mode}'
        slots.append({**row, 'id': row['stage3Id'] + '-' + name, 'model': name, 'mode': mode})
plan = dict(maps=[{**m, 'path': '../dual_stream_v2_phase4_20261020/' + m['path']} for m in old['maps']], slots=slots, budgets=old['budgets'], modelPrefix=f'generations/gen_{gen:02d}/model', calibrationPrefix=f'generations/gen_{gen:02d}', independentEvaluation=False, frozenBeforeBattles=True, sourcePlanSha256=hashlib.sha256((folder.parent / 'dual_stream_v2_phase4_20261020/battle-plan.json').read_bytes()).hexdigest())
target.parent.mkdir(parents=True, exist_ok=True)
target.write_text(json.dumps(plan, ensure_ascii=False, indent=2), encoding='utf-8')
