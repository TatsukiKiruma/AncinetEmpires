"""为同运行时冠军与第2代建立独立逐槽配对面板。"""
import json
import sys
from pathlib import Path
from run_league import save, sha

DIR = Path(__file__).resolve().parent


def make_plan(gen, arena_path, modes):
    target = DIR / arena_path / 'plan.json'
    if target.exists():
        return
    source = DIR.parent / 'dual_stream_v2_phase4_20261020/battle-plan.json'
    old = json.loads(source.read_text('utf-8'))
    slots = []
    for mode in modes:
        for row in old['slots']:
            if row['model'] != 'dual_v2_stage4_turn_search':
                continue
            name = f'dual_v2_gen{gen}_{mode}'
            slots.append({**row, 'id': row['stage3Id'] + '-' + name, 'model': name, 'mode': mode})
    contract = json.loads((DIR / 'RUN_CONTRACT.json').read_text('utf-8'))
    save(target, dict(maps=[{**m, 'path': '../dual_stream_v2_phase4_20261020/' + m['path']} for m in old['maps']], slots=slots, budgets=old['budgets'], modelPrefix=f'generations/gen_{gen:02d}/model', calibrationPrefix=f'generations/gen_{gen:02d}', independentEvaluation=False, frozenBeforeBattles=True, sourcePlanSha256=sha(source), runContractSha256=sha(DIR / 'RUN_CONTRACT.json'), runtimeIdentity=contract['runtimeIdentity']))


if __name__ == '__main__':
    gen = int(sys.argv[1])
    if gen == 0:
        make_plan(0, 'champion-pure-arena', ['pure'])
        make_plan(0, 'champion-search-arena', ['turn_search'])
    else:
        make_plan(gen, f'generations/gen_{gen:02d}/arena', ['pure', 'turn_search'])
