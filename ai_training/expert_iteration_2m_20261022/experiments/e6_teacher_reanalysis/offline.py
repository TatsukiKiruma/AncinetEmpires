"""固定第四轮离线准入；只允许B/C通过全部门禁后进入实战。"""
import torch
from core import HERE, R, read, write_new, check_budget, frames, teacher_labels, load_initial
from engineering import parity, node
from objectives import development


def main():
    torch.set_num_threads(4)
    torch.set_num_interop_threads(1)
    check_budget()
    search = teacher_labels(list(frames(HERE / 'data/dev-search.frames')), 'dev-search')
    value = list(frames(HERE / 'data/dev-value.frames'))
    baseline = development(load_initial(R / 'training/pretrain_full/model').eval(), value, search)
    baseline_tactics = read(HERE / 'tactics/champion.json')
    write_new(HERE / 'offline/champion.json', dict(metrics=baseline, tactics=baseline_tactics))
    results = {}
    for arm in ['A', 'B', 'C']:
        check_budget()
        complete = read(HERE / 'training' / arm / 'complete.json')
        assert complete['endpoint'] == 4 and set(complete['consumption'].values()) == {4}
        prefix = HERE / 'training' / arm / 'epoch-4'
        metrics = development(load_initial(prefix).eval(), value, search)
        tactical = read(HERE / 'training' / arm / 'epoch-4-tactics.json')
        cross = parity(prefix)
        gates = dict(finiteRealUpdate=bool(complete['changedTensors']), parity105=cross['passed'],
                     recovery=read(HERE / 'checks/recovery.json')['passed'],
                     tactics=tactical['correct'] >= baseline_tactics['correct'], valueNLL=metrics['valueNLL'] <= baseline['valueNLL'] * 1.1,
                     valueBrier=metrics['valueBrier'] <= baseline['valueBrier'] + .03)
        gates['tacticRootBudget'] = all(r['rootMs'] <= 4000 for r in tactical['records'])
        results[arm] = dict(passed=all(gates.values()), battleEligible=arm in ['B', 'C'] and all(gates.values()), gates=gates, metrics=metrics, tactics=tactical)
    updates = [read(HERE / 'training' / arm / 'complete.json')['updates'] for arm in ['A', 'B', 'C']]
    assert len(set(updates)) == 1
    write_new(HERE / 'offline-gate.json', dict(passed=any(r['battleEligible'] for r in results.values()), arms=results, baseline=baseline, updates=updates))


if __name__ == '__main__':
    main()
