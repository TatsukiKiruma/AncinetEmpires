"""冠军策略头保留蒸馏；冻结共享骨干和价值，保存完整可恢复身份。"""
import argparse
import hashlib
import json
import math
import os
import random
import time
import numpy as np
import torch
from data import DIR, load_model, collate, forward_batch
from calibrate import save
from mixed_batches import mixed_batches

POLICY_NAMES = ('who.', 'tile_q.', 'tile_k.', 'what_entity.', 'what_tile.', 'target_q.', 'target_k.', 'target_rel', 'headBias')


def main(generation, epochs):
    torch.set_num_threads(4)
    torch.set_num_interop_threads(1)
    torch.use_deterministic_algorithms(True)
    seed = 20261021 + generation
    random.seed(seed); np.random.seed(seed); torch.manual_seed(seed)
    league = json.loads((DIR / 'league-state.json').read_text('utf-8'))
    contract_bytes = (DIR / 'RUN_CONTRACT.json').read_bytes()
    contract = json.loads(contract_bytes)
    assert epochs == contract['training']['epochs'] == 1 and generation == 2
    folder = DIR / f'generations/gen_{generation:02d}'
    os.environ['LEAGUE_MODEL'] = league['championModelPath']
    os.environ['LEAGUE_GENERATION'] = str(generation)
    os.environ['LEAGUE_BASE_RATE'] = str(20000 / 141381)
    model, parent = load_model('model'), load_model('model').eval()
    for p in parent.parameters():
        p.requires_grad_(False)
    for name, p in model.named_parameters():
        p.requires_grad_(name.startswith(POLICY_NAMES))
    trainable = [p for p in model.parameters() if p.requires_grad]
    optimizer = torch.optim.AdamW(trainable, lr=.0001, weight_decay=.0001)
    input_files = [DIR / 'evaluation-exclusions.txt.gz', folder / 'league-plan.json']
    input_files += list((DIR.parent / 'dual_stream_v2_phase3_20261020/corpus').glob('train-*.jsonl.gz'))
    input_files += [DIR.parent / 'dual_stream_v2_phase3_20261020/split-manifest-v2-stage3.json']
    for entry in league['replayBufferManifest']:
        plan = json.loads((DIR / entry['manifest']).read_text('utf-8'))
        input_files += [DIR / f"generations/gen_{entry['generation']:02d}/games/{s['id']}/samples.jsonl.gz" for s in plan['slots']]
    identity = {str(p.relative_to(DIR.parent)): hashlib.sha256(p.read_bytes()).hexdigest() for p in input_files}
    source_identity = {name: hashlib.sha256((DIR.parents[1] / name).read_bytes()).hexdigest() for name in contract['sourceIdentity']}
    assert source_identity == contract['sourceIdentity'], '源码合同发生变化'
    contract_sha = hashlib.sha256(contract_bytes).hexdigest()
    cursor = dict(epoch=0, batch=0, updates=0, samples=0)
    stats = dict(baseSamples=0, expertSamples=0, baseWeighted=0., expertWeighted=0., rootScalarOptimizationWeight=0., frozenValueMaximumDifference=0.)
    checkpoint = folder / 'checkpoint.pt'
    if checkpoint.exists():
        ck = torch.load(checkpoint, weights_only=False)
        assert ck['dataIdentity'] == identity and ck['sourceIdentity'] == source_identity and ck['contractSha256'] == contract_sha and ck['parentSha256'] == league['championSha256'], '恢复身份变化，拒绝混用检查点'
        model.load_state_dict(ck['model']); optimizer.load_state_dict(ck['optimizer'])
        cursor, stats = ck['cursor'], ck['stats']
        torch.set_rng_state(ck['torchRng']); np.random.set_state(ck['numpyRng']); random.setstate(ck['pythonRng'])
    save(folder / 'training-input-identity.json', dict(dataIdentity=identity, sourceIdentity=source_identity, contractSha256=contract_sha, parentSha256=league['championSha256'], parentModel=league['championModelPath']))
    estimate = 20000 + sum(e['samples'] for e in league['replayBufferManifest'])
    started = time.perf_counter()

    def persist():
        tmp = checkpoint.with_suffix('.pt.tmp')
        torch.save(dict(model=model.state_dict(), optimizer=optimizer.state_dict(), cursor=cursor.copy(), stats=stats.copy(), dataIdentity=identity, sourceIdentity=source_identity, contractSha256=contract_sha, parentSha256=league['championSha256'], torchRng=torch.get_rng_state(), numpyRng=np.random.get_state(), pythonRng=random.getstate()), tmp)
        tmp.replace(checkpoint)
        save(folder / 'training-progress.json', dict(**cursor, **stats, seconds=time.perf_counter() - started))

    for epoch in range(cursor['epoch'], epochs):
        first = cursor['batch']
        mix_receipt = {}
        for index, samples in enumerate(mixed_batches(epoch, mix_receipt)):
            if index < first:
                continue
            x = collate(samples)
            out = forward_batch(model, x)
            with torch.no_grad():
                reference = forward_batch(parent, x)
            delta = float((out['valueLogits'] - reference['valueLogits']).abs().max())
            assert delta == 0, '冻结价值路径发生变化'
            stats['frozenValueMaximumDifference'] = max(stats['frozenValueMaximumDifference'], delta)
            expert = torch.tensor([s['source']['trainingSource'] == 'expert' for s in samples])
            weights = x['weight'] * x['quality'] * torch.where(expert, .5, 1.)
            rows = torch.arange(len(samples))
            policy = -out['logprob'][rows, x['target']]
            actor = x['ptr'][rows, x['target'], 0]
            who = -out['actorPrior'][rows, actor].clamp_min(1e-30).log()
            # 冠军KL约束使用当前训练前态，不读取开发或实战标签。
            kl = torch.nn.functional.kl_div(out['logprob'], reference['logprob'].exp(), reduction='none').sum(-1)
            loss = ((policy + .25 * who + .5 * kl) * weights).sum() / weights.sum().clamp_min(1e-12)
            fraction = min(1., cursor['samples'] / max(1, estimate))
            lr = .0001 * (.05 + .95 * .5 * (1 + math.cos(math.pi * fraction)))
            for group in optimizer.param_groups:
                group['lr'] = lr
            optimizer.zero_grad(set_to_none=True); loss.backward()
            norm = torch.nn.utils.clip_grad_norm_(trainable, 1.)
            assert torch.isfinite(norm) and torch.isfinite(loss)
            optimizer.step()
            for is_expert, name in [(False, 'base'), (True, 'expert')]:
                mask = expert == is_expert
                stats[name + 'Samples'] += int(mask.sum())
                stats[name + 'Weighted'] += float(weights[mask].sum())
            cursor.update(epoch=epoch, batch=index + 1, updates=cursor['updates'] + 1, samples=cursor['samples'] + len(samples))
            if cursor['updates'] % 50 == 0:
                persist(); print(json.dumps(dict(**cursor, loss=float(loss.detach()), seconds=time.perf_counter() - started)), flush=True)
        save(folder / f'mixed-stream-epoch{epoch}.json', mix_receipt)
        cursor.update(epoch=epoch + 1, batch=0); persist()
    for name, value in model.state_dict().items():
        if not name.startswith(POLICY_NAMES):
            assert torch.equal(value, parent.state_dict()[name]), f'冻结参数被修改:{name}'
    model.export(folder / 'model')
    save(folder / 'training-complete.json', dict(completed=True, **cursor, **stats, seconds=time.perf_counter() - started, modelSha256=hashlib.sha256((folder / 'model.bin').read_bytes()).hexdigest(), parentModel=league['championModelPath'], trainableParameters=sum(p.numel() for p in trainable), totalParameters=sum(p.numel() for p in model.parameters()), usesBattleResultsForHyperparameters=False))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(); parser.add_argument('--generation', type=int, required=True); parser.add_argument('--epochs', type=int, default=1)
    args = parser.parse_args(); main(args.generation, args.epochs)
