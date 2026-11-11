"""可恢复联赛状态机；已完成的阶段按收据复用，失败门禁不得冒充晋升。"""
import argparse
import hashlib
import json
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path

DIR = Path(__file__).resolve().parent
ROOT = DIR.parents[1]
os.environ['PYTHONDONTWRITEBYTECODE'] = '1'


def read(p): return json.loads(Path(p).read_text('utf-8'))


def save(p, x):
    p = Path(p); p.parent.mkdir(parents=True, exist_ok=True); tmp = p.with_suffix(p.suffix + '.tmp')
    tmp.write_text(json.dumps(x, ensure_ascii=False, indent=2), encoding='utf-8'); tmp.replace(p)


def sha(p): return hashlib.sha256(Path(p).read_bytes()).hexdigest()


def calibration_ready(folder):
    # 价值收据早于动作校准写出；中断恢复必须等待三份产物都完整。
    return all((folder / name).exists() for name in ['value-calibration.json', 'value-config.json', 'head-calibration.json'])


def verify_runtime_contract():
    # 规则或推理代码变化时，旧对战和数值收据不能继续充当新运行时的门禁。
    authority = read(DIR / 'index-authority-attestation.json')
    files = sorted(p for p in (ROOT / 'src/game').glob('*.ts') if not p.name.endswith('.test.ts'))
    aggregate = hashlib.sha256(':'.join(sha(p) for p in files).encode()).hexdigest()
    assert aggregate == authority['authoritySha256'], '权威规则源码变化，请建立新的规则基准后再续训'
    runtime = read(DIR / 'RUNTIME_REVISION.json')['gen2RuntimeSha256']
    changed = [name for name, digest in runtime.items() if sha(ROOT / name) != digest]
    assert not changed, f'公共推理源码变化，禁止复用旧门禁收据:{changed}'


def command(name, args, env=None):
    log = DIR / name
    with log.open('ab') as output:
        output.write(('\n' + json.dumps(args, ensure_ascii=False) + '\n').encode('utf-8')); output.flush()
        p = subprocess.Popen(args, cwd=ROOT, env={**os.environ, **(env or {})}, stdout=output, stderr=subprocess.STDOUT)
        save(DIR / 'pipeline-status.json', dict(stage=name, pid=p.pid, command=args, startedAt=time.time()))
        code = p.wait()
        if code != 0:
            save(DIR / 'pipeline-status.json', dict(stage='failed', failedStep=name, exitCode=code, endedAt=time.time()))
            raise RuntimeError(f'阶段失败，保留日志并可重试:{name}')


def node(name, script, *args, env=None):
    command(name, ['node', str(ROOT / 'ai_training/run.mjs'), 'node', '--import', 'tsx', 'dual_stream_v2_phase5_20261020/' + script, *map(str, args)], env)


def python(name, script, *args):
    command(name, ['node', str(ROOT / 'ai_training/run.mjs'), sys.executable, '-B', '-X', 'utf8', 'dual_stream_v2_phase5_20261020/' + script, *map(str, args)])


def parallel(name, script, args, env=None, lanes=2):
    processes = []; outputs = []
    try:
        for lane in range(lanes):
            log = (DIR / f'{name}-{lane}.log').open('ab'); outputs.append(log)
            cmd = ['node', str(ROOT / 'ai_training/run.mjs'), 'node', '--import', 'tsx', 'dual_stream_v2_phase5_20261020/' + script, *map(str, args), str(lane), str(lanes)]
            processes.append(subprocess.Popen(cmd, cwd=ROOT, env={**os.environ, **(env or {})}, stdout=log, stderr=subprocess.STDOUT))
        save(DIR / 'pipeline-status.json', dict(stage=name, pids=[p.pid for p in processes], startedAt=time.time()))
        codes = [p.wait() for p in processes]
        if any(codes):
            save(DIR / 'pipeline-status.json', dict(stage='failed', failedStep=name, exitCodes=codes, endedAt=time.time()))
            raise RuntimeError(f'并行阶段失败:{name}/{codes}')
    finally:
        for log in outputs: log.close()


def parity(gen):
    folder = DIR / f'generations/gen_{gen:02d}'; env = dict(LEAGUE_FOLDER=str(folder))
    if (folder / 'tri-runtime-parity.json').exists() and read(folder / 'tri-runtime-parity.json')['passed']: return
    node(f'gen{gen}-prepare-parity.log', 'prepare_parity.ts', env=env)
    command(f'gen{gen}-reference.log', [sys.executable, '-B', '-X', 'utf8', str(DIR / 'reference.py')], env)
    node(f'gen{gen}-node-parity.log', 'parity.ts', 'node', env=env)
    chrome_file = folder / 'model-browser-parity.json'
    if not chrome_file.exists() or not read(chrome_file)['passed'] or read(chrome_file)['weightsSha256'] != sha(folder / 'model.bin'):
        command(f'gen{gen}-chrome.log', ['node', str(DIR / 'browser_runner.mjs'), 'model'], env)
    n, c = read(folder / 'model-node-parity.json'), read(chrome_file)
    assert n['passed'] and c['passed'] and c['chromeProfileCleaned']
    save(folder / 'tri-runtime-parity.json', dict(passed=True, states=89, modelSha256=sha(folder / 'model.bin'), node=n, chrome=c))


def initialize():
    if (DIR / 'league-state.json').exists():
        # 旧代产物完整保留，只运行本次冻结运行时的冠军搜索基线。
        baseline = DIR / 'champion-search-arena'
        assert read(baseline / 'plan.json')['runtimeRevision'] == 'gen02-phase51'
        if not (baseline / 'arena-summary.json').exists():
            parallel('phase51-champion-search', 'battle.ts', ['play'], dict(LEAGUE_ARENA='champion-search-arena'), lanes=2)
            from arena_summary import summarize
            summarize(0, arena_path='champion-search-arena')
        return
    folder = DIR / 'generations/gen_00'
    if not calibration_ready(folder):
        for split in ['train', 'dev']:
            if not (DIR / f'{split}-features.json').exists(): node(f'features-{split}.log', 'features.ts', split)
        python('gen0-calibration.log', 'calibrate.py', '--generation', 0)
    parity(0)
    python('gen0-arena-plan.log', 'arena_plan.py', 0)
    if not (folder / 'arena-summary.json').exists():
        parallel('gen0-arena', 'battle.ts', ['play'])
        python('gen0-summary.log', 'arena_summary.py', 0)
    if not (DIR / 'league-state.json').exists():
        model_path = 'generations/gen_00/model'; model_hash = sha(folder / 'model.bin')
        for suffix in ['json', 'bin']: shutil.copyfile(folder / ('model.' + suffix), DIR / ('dual-v2-champion.' + suffix))
        save(DIR / 'league-state.json', dict(schema='dual-v2-resumable-league-v1', currentGeneration=0, championGeneration=0, championModelPath=model_path, championSha256=model_hash, championCalibrationPath='generations/gen_00', hallOfFame=[dict(generation=0, modelPath=model_path, sha256=model_hash, calibrationPath='generations/gen_00')], seedCursor=0, usedParentPrefixes=[], replayBufferManifest=[], promotionHistory=[]))


def wins(summary, mode, panel):
    panels = ['3ffa', '4ffa', '2v2'] if panel == 'multiplayer' else [panel]
    return sum(summary['groups'].get(mode + '/' + p, {}).get('outcomes', {}).get('natural_win', 0) for p in panels)


def promote(gen):
    state = read(DIR / 'league-state.json'); folder = DIR / f'generations/gen_{gen:02d}'
    current = read(folder / 'arena-summary.json')
    compared_gen = state['championGeneration']
    previous = read(DIR / ('champion-search-arena/arena-summary.json' if compared_gen == 0 else f'generations/gen_{compared_gen:02d}/arena-summary.json'))
    previous_pure = read(DIR / 'champion-pure-arena/arena-summary.json') if compared_gen == 0 else previous
    value = read(folder / 'value-calibration.json')['passed']; parity_ok = read(folder / 'tri-runtime-parity.json')['passed']
    extraction = read(folder / 'extraction-summary.json')
    league_strict = extraction['strictAllAttempts'] and extraction['games'] == 60 and extraction['corrections'] > 0
    search_no_regression = all(wins(current, 'turn_search', panel) >= wins(previous, 'turn_search', panel) for panel in ['fixed', 'expanded', 'multiplayer'])
    # 以同运行时的冠军纯策略逐面板守门，不能把先验修订的收益算成蒸馏提升。
    pure_wins = sum(wins(current, 'pure', p) for p in ['fixed', 'expanded', 'multiplayer'])
    pure_ok = all(wins(current, 'pure', p) >= wins(previous_pure, 'pure', p) for p in ['fixed', 'expanded', 'multiplayer'])
    qualified = current['complete'] and current['strictAllAttempts'] and current['noTimeoutOrWall'] and current['p95'] and current['queueBelow1ms'] and value and parity_ok and search_no_regression and pure_ok and league_strict
    record = dict(generation=gen, comparedChampionGeneration=compared_gen, promoted=qualified, searchNoRegression=search_no_regression, pureNoRegression=pure_ok, leagueStrict=league_strict, valueBaselines=value, parity=parity_ok, pureWins=pure_wins, sameRuntimeBaseline=True)
    save(folder / 'promotion.json', record)
    if qualified:
        state.update(championGeneration=gen, championModelPath=f'generations/gen_{gen:02d}/model', championSha256=sha(folder / 'model.bin'), championCalibrationPath=f'generations/gen_{gen:02d}')
        state['hallOfFame'].append(dict(generation=gen, modelPath=state['championModelPath'], sha256=state['championSha256'], calibrationPath=state['championCalibrationPath']))
        for suffix in ['json', 'bin']: shutil.copyfile(folder / ('model.' + suffix), DIR / ('dual-v2-champion.' + suffix))
    state['currentGeneration'] = gen
    state['promotionHistory'] = [r for r in state['promotionHistory'] if r['generation'] != gen] + [record]
    state.pop('pendingReservation', None); save(DIR / 'league-state.json', state)


def main(target, epochs):
    verify_runtime_contract()
    initialize()
    state = read(DIR / 'league-state.json')
    for gen in range(state['currentGeneration'] + 1, target + 1):
        folder = DIR / f'generations/gen_{gen:02d}'; folder.mkdir(exist_ok=True)
        node(f'gen{gen}-plan.log', 'league_plan.ts', gen)
        parallel(f'gen{gen}-selfplay', 'selfplay.ts', [gen], lanes=2)
        historical_plan = DIR / 'historical-arena/plan.json'
        if historical_plan.exists():
            slots = read(historical_plan)['slots']
            while not all((DIR / 'historical-arena/battles' / s['id'] / 'strict-replay.json').exists() for s in slots):
                save(DIR / 'pipeline-status.json', dict(stage='waiting_historical_before_training', generation=gen, reason='先冻结全部当前评测排重，再开始训练'))
                time.sleep(5)
        node(f'gen{gen}-extract.log', 'extract.ts', gen)
        if not (folder / 'training-complete.json').exists(): python(f'gen{gen}-distill.log', 'distill.py', '--generation', gen, '--epochs', epochs)
        if not calibration_ready(folder): python(f'gen{gen}-calibration.log', 'calibrate.py', '--generation', gen)
        parity(gen)
        python(f'gen{gen}-arena-plan.log', 'arena_plan.py', gen)
        parallel(f'gen{gen}-arena', 'battle.ts', ['play'], dict(LEAGUE_ARENA=f'generations/gen_{gen:02d}/arena'))
        python(f'gen{gen}-summary.log', 'arena_summary.py', gen)
        promote(gen)
    save(DIR / 'pipeline-status.json', dict(stage='target_finished', targetGeneration=target, completedAt=time.time(), leagueState=read(DIR / 'league-state.json')))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(); parser.add_argument('--target-gen', type=int, required=True); parser.add_argument('--epochs', type=int, default=1)
    args = parser.parse_args()
    if args.target_gen < 0 or args.epochs < 1: parser.error('代数必须非负，轮次必须为正整数')
    main(args.target_gen, args.epochs)
