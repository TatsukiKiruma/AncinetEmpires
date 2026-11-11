"""E6单次有界执行；失败门禁即停，永不调用旧pipeline或旧采样计划。"""
import argparse
import concurrent.futures
import os
import sys
import time
from core import HERE, R, ROOT, read, write_new, digest
from budget import Budget
from evaluation import node, evaluate


def preservation():
    receipt = R / 'execution_v5/user-control/stop-after-gen02-20261024T003807/receipt.json'
    data = read(receipt)
    assert data['thirdGenerationTrainingStarted'] is False and data['trainingParentsAdmitted'] == 161
    assert data['thirdGenerationSamplingResultsPreserved'] == data['thirdGenerationStrictReceiptsPreserved'] == 27
    assert data['automaticResumeAllowed'] is False
    run_state = read(R / 'execution_v5/RUN_STATE.json')
    assert run_state['stage'] == 'stopped_by_user'
    files = [receipt, R / 'execution_v5/RUN_STATE.json', *R.glob('execution_v5/*.py'), *R.glob('execution_v5/*.ts'),
             R / 'execution_v5/protocol.json', R / 'execution_v5/plan.json', *R.glob('**/PAUSE_REQUEST.json'),
             *R.glob('execution_v5/user-control/**/*'), *R.glob('pauses/**/*'),
             *R.glob('execution_v5/generations/gen_03/**/*')]
    files += [R / 'training' / name / ('model' + suffix) for name in ['pretrain_full', 'v5_gen_01', 'v5_gen_02'] for suffix in ['.bin', '.json']]
    values = {str(p): digest(p) for p in files if p.is_file()}
    assert values[str(R / 'training/pretrain_full/model.bin')] == 'a821caacd5aab11ee2af2f6639f2cc0f5780550e2964b87d4a3f117ca4169090'
    return values


def freeze():
    protocol = read(HERE / 'protocol.json')
    sources = [*HERE.glob('*.py'), *HERE.glob('*.ts'), HERE / 'protocol.json', HERE / 'PROTOCOL.md',
               *R.glob('*.py'), R / 'execution_v5/expert_source.ts', R / 'execution_v4/gzip_rows.ts',
               *ROOT.glob('src/game/**/*.ts'), *ROOT.glob('src/ai_runtime/**/*.ts')]
    assets = R.parent / 'pretrain_preflight_20261022/evaluation/assets/phase5-gen03'
    sources += [p for p in assets.glob('*') if p.is_file()]
    write_new(HERE / 'frozen-identity.json', dict(protocol=protocol, files={str(p): digest(p) for p in sources if p.is_file()}))


def verify_frozen():
    for file, expected in read(HERE / 'frozen-identity.json')['files'].items():
        assert digest(file) == expected, f'冻结源码/依赖身份变化：{file}'


def teacher(budget):
    def run(entry):
        split, index = entry
        folder = HERE / 'teacher' / split / str(index)
        folder.mkdir(parents=True, exist_ok=False)
        env = dict(os.environ, E6_ROOT_DEADLINE=str(int(time.time() * 1000) + 60000))
        try:
            budget.run(node(HERE / 'teacher.ts', HERE / 'data' / (split + '.json'), index, folder), folder / 'worker.log', timeout=60, env=env)
        except BaseException as error:
            # 超时仍保留started及已写入的前缀；strict门禁把缺失结果计为未完成。
            write_new(folder / 'incomplete.json', dict(reason=repr(error), split=split, index=index, deadline=env['E6_ROOT_DEADLINE']))
    jobs = [('train', i) for i, r in enumerate(read(HERE / 'data/train.json')) if r['source'] == 'search-expert']
    # 老师训练侧只运行512个搜索态，数据文件索引保留完整训练集身份。
    jobs += [('dev-search', i) for i in range(128)]
    assert len(jobs) == 640
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        list(pool.map(run, jobs))
    budget.run(node(HERE / 'strict_teacher.ts'), HERE / 'logs/strict-teacher.log')


def report(reason, preservation_before):
    after = preservation()
    preserved = after == preservation_before
    if not preserved:
        reason = (reason or '') + '；旧暂停、第三代或源证据身份发生变化，需核对外部现场'
        write_new(HERE / 'preservation-difference.json', dict(before=preservation_before, after=after))
    gate_files = ['data-gate.json', 'teacher-gate.json', 'tactical-teacher-gate.json', 'offline-gate.json', 'hard-assessment.json']
    gates = {name: read(HERE / name) for name in gate_files if (HERE / name).exists()}
    signals = gates.get('hard-assessment.json', {}).get('methodSignals', {})
    positive = not reason and any(signals.values())
    conclusion = '探索性正向信号，仅建议下一轮确认' if positive else '不确定，证据不足'
    elapsed = (time.time() * 1000 - read(HERE / 'run-start.json')['startedAtEpochMs']) / 1000
    write_new(HERE / 'RESULT.json', dict(reason=reason, gates=gates, legacyPreserved=preserved, trainingStarted=(HERE / 'training').exists(),
                                       conclusion=conclusion, elapsedSeconds=elapsed, automaticNewRound=False, humanLevelClaim=False))
    text = '# E6 执行结果\n\n' + ('已按门禁停止：' + reason if reason else '已完成本轮受限计算。') + '\n\n'
    text += f'结论：{conclusion}。本轮正式计算耗时{elapsed:.1f}秒。旧证据身份保持：{preserved}。未扩采、未自动晋升、未部署界面、未接入手机数据。\n\n'
    text += 'E6定向类型检查、5项TS测试和4项Python工程测试通过。全研究区lint仍有12项历史类型错误，全套测试448通过/63失败；失败详情见checks/workspace-checks.json，未记为通过。\n\n'
    for name, gate in gates.items():
        text += f'- `{name}`：{json_text(gate)}\n'
    text += '\n未生成的学习曲线或实战结果表示依赖阶段未获准启动，不能记为通过。20局单种子仅为探索性开发证据，本轮不能认证人类水平。\n'
    with (HERE / 'REPORT.md').open('x', encoding='utf-8') as f:
        f.write(text)


def json_text(value):
    import json
    return json.dumps(value, ensure_ascii=False)


def main():
    parser = argparse.ArgumentParser(); parser.add_argument('--run', action='store_true', required=True); parser.parse_args()
    before = preservation()
    checks = read(HERE / 'checks/unit-tests.json'); assert checks['passed']
    for file, expected in checks['files'].items():
        assert digest(file) == expected, '实现检查后源码已变化，需重新检查'
    freeze(); write_new(HERE / 'preservation-before.json', before)
    budget = Budget(); reason = None
    try:
        budget.enter('admission')
        budget.run([sys.executable, '-B', '-X', 'utf8', str(HERE / 'engineering.py')], HERE / 'logs/engineering.log')
        budget.run(node(HERE / 'data.ts'), HERE / 'logs/data.log')
        assert read(HERE / 'data-gate.json')['passed'], '数据配额门禁未通过'
        verify_frozen()
        budget.enter('teacher')
        budget.run(node(HERE / 'tactics.ts', 'prepare'), HERE / 'logs/tactics-prepare.log')
        budget.run(node(HERE / 'tactics.ts', 'model', R / 'training/pretrain_full/model', HERE / 'tactics/champion.json'), HERE / 'logs/tactics-champion.log')
        budget.run(node(HERE / 'tactics.ts', 'teacher'), HERE / 'logs/tactics-teacher.log')
        budget.run(node(HERE / 'strict_tactics.ts'), HERE / 'logs/strict-tactics.log')
        assert read(HERE / 'tactical-teacher-gate.json')['passed'], '24例战术老师门禁未通过'
        teacher(budget)
        assert read(HERE / 'teacher-gate.json')['passed'], '老师完成率或可靠偏好门禁未通过'
        verify_frozen()
        budget.enter('training')
        for arm in ['A', 'B', 'C']:
            budget.run([sys.executable, '-B', '-X', 'utf8', str(HERE / 'train.py'), arm], HERE / 'logs' / ('train-' + arm + '.log'))
        budget.run([sys.executable, '-B', '-X', 'utf8', str(HERE / 'offline.py')], HERE / 'logs/offline.log')
        assert read(HERE / 'offline-gate.json')['passed'], 'B/C离线准入未通过'
        verify_frozen()
        budget.enter('battle'); evaluate(budget)
    except BaseException as error:
        reason = repr(error)
    finally:
        budget.enter('summary'); report(reason, before)
    if reason:
        print(reason, flush=True); sys.exit(2)


if __name__ == '__main__':
    main()
