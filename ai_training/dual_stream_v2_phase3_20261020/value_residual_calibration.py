"""实战前对既有军力残差与温度作有界校准；不增加参数、不改策略。"""
import hashlib
import json
import shutil
import subprocess
import sys
from pathlib import Path
import torch
from train import DIR, ROOT, load_model, save
from calibrate import collect, value_metrics, policy_metrics


def main():
    assert not (DIR / 'FINAL_MODEL_FROZEN.json').exists(), '最终冻结后禁止调整参数'
    assert not any((DIR / 'battles').glob('*/result.json')), '已有实战结果，禁止反向调整'
    torch.set_num_threads(4)
    attempt = DIR / 'calibration-attempt01'
    attempt.mkdir(exist_ok=False)
    names = ['head-calibration.json', 'value-calibration.json', 'calibration-complete.json', 'calibration-source-identities.json', 'calibration-freeze-audit.json',
             'dual-v2-stage3-pure.json', 'dual-v2-stage3-pure.bin', 'dual-v2-stage3-pure-torch-reference.json', 'dual-v2-stage3-pure-node-parity.json', 'dual-v2-stage3-pure-node-output.json', 'calibrate.py']
    for name in names:
        shutil.copyfile(DIR / name, attempt / name)
    old = json.loads((DIR / 'value-calibration.json').read_text('utf-8'))
    save('value-residual-protocol.json', dict(reason='原候选各分层Brier/KL均优于基线，但4p及部分后期Top1尚未全面超越Army Share；在零实战时追加现有army_scale与温度校准',
         betaGrid=[-2., -1., -.5, 0., .25, .5, .75, 1., 1.5, 2., 3., 4., 6., 8., 12.], temperatureGrid=[.5, .75, 1., 1.25, 1.5, 2., 3., 4.],
         selection='先要求所有分层同时全面超过原三基线，再按整体开发KL最小选择；无合格则保留原候选', policyAndBackboneFrozen=True, gamesConsumed=0,
         sourceSha256=hashlib.sha256(Path(__file__).read_bytes()).hexdigest()))
    model = load_model('dual-v2-stage3-pure').eval()
    data = collect(model, 'dev')
    assert json.loads((DIR / 'stream-receipts/dev-epoch0.json').read_text('utf-8'))['aggregateSha256'] == old['developmentInputSha256']
    active, target, sources = data['active'], data['valueTarget'], data['sources']
    army = data['army'].clamp_min(0) * active
    army /= army.sum(-1, keepdim=True).clamp_min(1e-30)
    slices = {'all': list(range(len(target)))}
    for phase in ['opening', 'middle', 'late']:
        slices[f'all/{phase}'] = [i for i, s in enumerate(sources) if ('opening' if s['turn'] <= 5 else 'middle' if s['turn'] <= 15 else 'late') == phase]
    for players in [2, 3, 4]:
        slices[f'{players}p/all'] = [i for i, s in enumerate(sources) if s['configuredPlayers'] == players]
        for phase in ['opening', 'middle', 'late']:
            slices[f'{players}p/{phase}'] = [i for i, s in enumerate(sources) if s['configuredPlayers'] == players and ('opening' if s['turn'] <= 5 else 'middle' if s['turn'] <= 15 else 'late') == phase]
    indices = {k: torch.tensor(v, dtype=torch.long) for k, v in slices.items()}
    ffa = all(len({a for a, enabled in zip(s['alliances'], mask) if enabled}) == int(mask.sum()) for s, mask in zip(sources, active))
    attempts = []; qualified = []; best = None; best_kl = float('inf')
    for beta in [-2., -1., -.5, 0., .25, .5, .75, 1., 1.5, 2., 3., 4., 6., 8., 12.]:
        for temperature in [.5, .75, 1., 1.25, 1.5, 2., 3., 4.]:
            prob = ((data['valueLogits'] + beta * army) / temperature).softmax(-1) * active
            top = target.gather(1, prob.argmax(-1)[:, None]).flatten() > 0
            top1 = {k: int(top[ids].sum()) / max(1, len(ids)) for k, ids in indices.items()}
            rank_pass = all(len(ids) and top1[k] > max(old['slices'][k][b]['allianceTop1'] for b in ['uniform', 'seatPrior', 'armyShare']) for k, ids in indices.items()) if ffa else True
            record = dict(beta=beta, relativeTemperature=temperature, top1=top1, rankPassed=rank_pass)
            attempts.append(record)
            if not rank_pass:
                continue
            metrics = {k: value_metrics(prob[ids], target[ids], active[ids], [sources[i] for i in slices[k]]) for k, ids in indices.items()}
            passed = all(m['brier'] < old['slices'][k][b]['brier'] and m['kl'] < old['slices'][k][b]['kl'] and m['allianceTop1'] > old['slices'][k][b]['allianceTop1'] and m['allianceRocAuc'] is not None and m['allianceRocAuc'] > old['slices'][k][b]['allianceRocAuc'] for k, m in metrics.items() for b in ['uniform', 'seatPrior', 'armyShare'])
            record.update(allPassed=passed, overallKl=metrics['all']['kl'])
            qualified.append(record)
            if passed and metrics['all']['kl'] < best_kl:
                best = (beta, temperature, metrics); best_kl = metrics['all']['kl']
    save('value-residual-calibration.json', dict(passed=best is not None, attempts=attempts, rankQualified=len(qualified), selected=None if best is None else dict(beta=best[0], relativeTemperature=best[1]), backboneAndPolicyUnchanged=True, gamesConsumed=0))
    if best is None:
        print(json.dumps(dict(residualCalibrationPassed=False, rankQualified=len(qualified), preservedOriginal=True)), flush=True)
        return
    beta, temperature, _ = best
    with torch.no_grad():
        model.value2.weight /= temperature; model.value2.bias /= temperature
        model.army_scale.add_(beta).div_(temperature)
    actual = collect(model, 'dev')
    prob = actual['valueLogits'].softmax(-1) * active
    verified = {k: value_metrics(prob[ids], target[ids], active[ids], [sources[i] for i in slices[k]]) for k, ids in indices.items()}
    passed = all(m['brier'] < old['slices'][k][b]['brier'] and m['kl'] < old['slices'][k][b]['kl'] and m['allianceTop1'] > old['slices'][k][b]['allianceTop1'] and m['allianceRocAuc'] > old['slices'][k][b]['allianceRocAuc'] for k, m in verified.items() for b in ['uniform', 'seatPrior', 'armyShare'])
    if not passed:
        save('value-residual-final-rounding-failure.json', dict(passed=False, metrics=verified, preservedOriginal=True)); return
    head = json.loads((DIR / 'head-calibration.json').read_text('utf-8'))
    assert policy_metrics(actual, torch.zeros(15)) == head['after']
    model.export(DIR / 'dual-v2-stage3-pure')
    old['selectedTemperatureBeforeResidual'] = old['selectedTemperature']; old['selectedTemperature'] *= temperature
    old['armyResidualDeltaRelativeStage3a'] = beta * old['selectedTemperatureBeforeResidual']
    old.update(passed=True, residualCalibration=True, finalWeightsReevaluated=True)
    for k, metric in verified.items():
        old['slices'][k]['model'] = metric; old['slices'][k]['allBaselinesExceeded'] = True
    save('value-calibration.json', old)
    done = json.loads((DIR / 'calibration-complete.json').read_text('utf-8')); done.update(valueGate=True, residualCalibration=True); save('calibration-complete.json', done)
    original = load_model('stage3a-best')
    changed = [k for k, v in model.state_dict().items() if not torch.equal(v, original.state_dict()[k])]
    assert set(changed) <= {'headBias', 'value2.weight', 'value2.bias', 'army_scale'}
    save('calibration-freeze-audit.json', dict(passed=True, changedTensors=changed, headBiasLength=15, modelParameters=sum(p.numel() for p in model.parameters()), frozenBackboneUnchanged=True, residualCalibration=True))
    for command, log in [([sys.executable, '-X', 'utf8', str(DIR / 'reference.py')], 'residual-reference.log'),
                         (['node', str(ROOT / 'ai_training/run.mjs'), 'node', '--import', 'tsx', 'dual_stream_v2_phase3_20261020/parity.ts', 'node'], 'residual-node-parity.log')]:
        with (DIR / log).open('w', encoding='utf-8') as output:
            result = subprocess.run(command, cwd=ROOT, stdout=output, stderr=subprocess.STDOUT)
        assert result.returncode == 0
    print(json.dumps(dict(residualCalibrationPassed=True, beta=beta, temperature=temperature)), flush=True)


if __name__ == '__main__':
    main()
