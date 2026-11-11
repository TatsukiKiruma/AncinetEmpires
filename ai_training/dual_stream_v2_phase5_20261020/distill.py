"""第3代先验感知纠错蒸馏；共享骨干、价值及内置偏置严格冻结。"""
import argparse
import hashlib
import json
import os
import random
import shutil
import time
import numpy as np
import torch
from data import DIR, batches, load_model, collate, forward_batch
from phase52_io import save
from mixed_stream import interleave_batches
from prior_distillation import freeze_policy_only, policy_loss, assert_frozen_equal


def main(generation, epochs):
    assert generation == 3, '当前预登记仅授权第3代合同'
    torch.set_num_threads(4); torch.set_num_interop_threads(1); torch.use_deterministic_algorithms(True)
    random.seed(20261020 + generation); np.random.seed(20261020 + generation); torch.manual_seed(20261020 + generation)
    league = json.loads((DIR / 'league-state.json').read_text('utf-8'))
    assert league['championGeneration'] == 0
    replay = [e for e in league['replayBufferManifest'] if 2 <= e['generation'] <= generation]
    folder = DIR / f'generations/gen_{generation:02d}'; checkpoint = folder / 'checkpoint.pt'
    os.environ['LEAGUE_MODEL'] = league['championModelPath']; os.environ['LEAGUE_GENERATION'] = str(generation)
    model, teacher = load_model('model'), load_model('model').eval()
    for parameter in teacher.parameters(): parameter.requires_grad_(False)
    trainable = freeze_policy_only(model)
    optimizer = torch.optim.AdamW(trainable, lr=2e-5, weight_decay=1e-4)
    bias = torch.tensor(json.loads((DIR / 'generations/gen_00/head-calibration.json').read_text('utf-8'))['headBias'], dtype=torch.float64)
    config = dict(epochs=epochs, baseRate=20000 / 141381, optimizer='AdamW', lr=2e-5, minLr=2e-6, weightDecay=1e-4, mixing='proportional-acrossGames-correction-only-prior-aware-v3', expertGenerations=[e['generation'] for e in replay], tacticalWeight=1.5, moveWeight=.5, waitHardWeight=0., baseKl=1., baseCe=.2, expertMargin=1., margin=.5, expertCe=.5, expertKl=.5, rootScalarWeight=0., valueWeight=0., frozenHeadBias=True)
    input_files = [DIR / 'evaluation-exclusions.txt.gz', folder / 'league-plan.json']
    input_files += sorted((DIR.parent / 'dual_stream_v2_phase3_20261020/corpus').glob('train-*.jsonl.gz'))
    input_files += [DIR / 'generations/gen_00/head-calibration.json']
    for entry in replay:
        plan = json.loads((DIR / entry['manifest']).read_text('utf-8'))
        input_files += [DIR / f"generations/gen_{entry['generation']:02d}/games/{slot['id']}/samples.jsonl.gz" for slot in plan['slots']]
    data_identity = {os.path.relpath(p, DIR).replace('\\', '/'): hashlib.sha256(p.read_bytes()).hexdigest() for p in input_files}
    source_files = [DIR / n for n in ['distill.py', 'prior_distillation.py', 'phase52_io.py', 'mixed_stream.py', 'data.py', 'stream.ts', 'league_stream.ts', 'common.ts', 'value_target.ts']]
    source_files += list((DIR.parent / 'dual_stream_v2_phase2_20261020').glob('*.py'))
    source_files += [DIR.parent / 'dual_stream_v2_phase3_20261020' / n for n in ['batch_model.py', 'source_loader.ts']]
    source_files += list((DIR.parent / 'dual_stream_v2_phase1_20261020').glob('*.ts'))
    source_files += list((DIR.parents[1] / 'src/ai_runtime/dual_v2').glob('*.ts'))
    source_identity = {str(p.relative_to(DIR.parents[1])): hashlib.sha256(p.read_bytes()).hexdigest() for p in source_files}
    for source in source_files:
        target = folder / 'training-source-snapshot' / source.relative_to(DIR.parents[1])
        target.parent.mkdir(parents=True, exist_ok=True)
        if target.exists(): assert hashlib.sha256(target.read_bytes()).hexdigest() == source_identity[str(source.relative_to(DIR.parents[1]))]
        else: shutil.copyfile(source, target)
    save(folder / 'training-source-snapshot.json', source_identity)
    cursor = dict(epoch=0, batch=0, updates=0, samples=0, baseSamples=0, expertSamples=0); history = []
    if checkpoint.exists():
        ck = torch.load(checkpoint, weights_only=False)
        assert ck['config'] == config and ck['dataIdentity'] == data_identity and ck['sourceIdentity'] == source_identity and ck['parentSha256'] == league['championSha256'], '恢复合同变化，拒绝混用检查点'
        model.load_state_dict(ck['model']); optimizer.load_state_dict(ck['optimizer']); cursor = ck['cursor']; history = ck['history']
        torch.set_rng_state(ck['torchRng']); np.random.set_state(ck['numpyRng']); random.setstate(ck['pythonRng'])
    save(folder / 'training-input-identity.json', dict(dataIdentity=data_identity, sourceIdentity=source_identity, parentSha256=league['championSha256'], replayBufferManifest=replay, config=config))
    expert_estimate = sum(json.loads((DIR / f"generations/gen_{e['generation']:02d}/extraction-summary.json").read_text('utf-8'))['corrections'] for e in replay)
    total_estimate = epochs * (20000 + expert_estimate)
    started = time.perf_counter()

    def persist():
        tmp = folder / 'checkpoint.pt.tmp'
        torch.save(dict(model=model.state_dict(), optimizer=optimizer.state_dict(), cursor=cursor.copy(), history=history, dataIdentity=data_identity, sourceIdentity=source_identity, torchRng=torch.get_rng_state(), numpyRng=np.random.get_state(), pythonRng=random.getstate(), parentModel=league['championModelPath'], parentSha256=league['championSha256'], config=config), tmp)
        tmp.replace(checkpoint)
        save(folder / 'training-progress.json', {**cursor, 'history': history})

    for epoch in range(cursor['epoch'], epochs):
        first = cursor['batch']
        base = batches('train', epoch, stream='dual_stream_v2_phase5_20261020/stream.ts', env=dict(LEAGUE_BASE_RATE=str(config['baseRate'])))
        expert = batches('train', epoch, stream='dual_stream_v2_phase5_20261020/league_stream.ts')
        for index, (kind, samples) in enumerate(interleave_batches(base, expert, 20000, expert_estimate)):
            if index < first: continue
            x = collate(samples)
            assert not ((x['valueTarget'] * ~x['active']).abs().sum(-1)[x['valueMask']] > 1e-7).any(), '价值标签向非活跃槽分配质量'
            out = forward_batch(model, x)
            with torch.no_grad(): reference = forward_batch(teacher, x)
            assert torch.equal(out['valueLogits'], reference['valueLogits']), '价值logits必须严格零漂移'
            loss = policy_loss(kind, out, reference, x, samples, bias)
            fraction = min(1., cursor['samples'] / max(1, total_estimate))
            lr = 2e-6 + (2e-5 - 2e-6) * .5 * (1 + __import__('math').cos(__import__('math').pi * fraction))
            for group in optimizer.param_groups: group['lr'] = lr
            optimizer.zero_grad(set_to_none=True); loss.backward(); norm = torch.nn.utils.clip_grad_norm_(model.parameters(), 1.)
            assert torch.isfinite(norm); optimizer.step()
            assert_frozen_equal(model, teacher)
            cursor.update(epoch=epoch, batch=index + 1, updates=cursor['updates'] + 1, samples=cursor['samples'] + len(samples))
            cursor[kind + 'Samples'] += len(samples)
            if cursor['updates'] % 50 == 0:
                persist(); print(json.dumps({**cursor, 'source': kind, 'lr': lr, 'loss': float(loss.detach()), 'maxValueLogitsDifference': 0., 'seconds': round(time.perf_counter() - started, 1)}), flush=True)
        history.append(dict(epoch=epoch, baseSamples=cursor['baseSamples'], expertSamples=cursor['expertSamples']))
        cursor.update(epoch=epoch + 1, batch=0); persist()
    model.export(folder / 'model')
    save(folder / 'training-complete.json', dict(completed=True, **cursor, seconds=time.perf_counter() - started, modelSha256=hashlib.sha256((folder / 'model.bin').read_bytes()).hexdigest(), history=history, config=config, parentModel=league['championModelPath'], maxValueLogitsDifference=0., frozenParametersByteEqual=True, lastLearningRate=optimizer.param_groups[0]['lr'], trainableParameters=[name for name, p in model.named_parameters() if p.requires_grad], usesBattleResultsForHyperparameters=False))
    print(json.dumps(dict(completed=True, generation=generation, updates=cursor['updates'], samples=cursor['samples'])), flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(); parser.add_argument('--generation', type=int, required=True); parser.add_argument('--epochs', type=int, default=1)
    args = parser.parse_args(); main(args.generation, args.epochs)
