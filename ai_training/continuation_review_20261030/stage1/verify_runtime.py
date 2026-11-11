"""已有独立前态上的恢复、前向、梯度、掩码与微批合同，无正式训练。"""
import copy
import json
import time
import torch
from runtime import HERE, Encoder, fresh, tensor_digest, collate, move, forward_batch, loss, groups, identity, save


def relative(a, b):
    return float(torch.linalg.vector_norm(a - b) / torch.linalg.vector_norm(a).clamp_min(1e-12))


def main():
    start = time.perf_counter()
    torch.set_num_threads(2)
    torch.set_num_interop_threads(1)
    manifest = json.loads((HERE / 'PARTITIONS.json').read_text('utf-8'))
    selected = []
    for players in [2, 3, 4]:
        p = next(p for p in manifest['parents'] if p['corpus'] == 'new' and p['split'] == 'train' and p['players'] == players and p['admitted'])
        selected.append(dict(parentId=p['parentId'], macro=p['positions'][len(p['positions']) // 2][0], sub=0, choice=0, split='train'))
    encoder = Encoder(HERE / 'runtime-encoder.stderr.log')
    try:
        rows = encoder.rows(selected)
    finally:
        encoder.close()
    cpu, _, _, inherited, receipt = fresh(torch.device('cpu'), 1e-4, 10000)
    gpu, opt, _, _, gpu_receipt = fresh(torch.device('cuda:0'), 1e-4, 10000)
    assert tensor_digest(cpu.state_dict()) == inherited['digests']['model']
    assert gpu_receipt['optimizerRestoreDigest'] == inherited['digests']['optimizer']
    assert {id(p) for p in gpu.parameters()} == {id(p) for group in opt.param_groups for p in group['params']}
    cpu.eval()
    gpu.eval()
    forward_errors = []
    for row in rows:
        target = int(row['policyTarget'])
        assert 0 <= target < len(row['pointers'])
        assert len(set(row['sourceIndices'].tolist())) == len(row['pointers'])
        assert torch.isclose(row['valueTarget'].sum(), torch.tensor(1.))
        assert torch.all(row['valueTarget'][~row['active'].bool()] == 0)
        x = collate([row])
        with torch.no_grad():
            reference, batched, accelerated = cpu(row), forward_batch(cpu, x), forward_batch(gpu, move(x, 'cuda:0'))
        for key in ['logits', 'valueProbs']:
            torch.testing.assert_close(reference[key], batched[key][0], atol=2e-5, rtol=2e-4)
            torch.testing.assert_close(batched[key], accelerated[key].cpu(), atol=2e-5, rtol=2e-3)
            forward_errors.append(dict(players=int(row['active'].sum()), key=key, maxAbs=float((batched[key] - accelerated[key].cpu()).abs().max()), relativeL2=relative(batched[key], accelerated[key].cpu())))
        assert torch.all(accelerated['valueProbs'][0, ~row['active'].bool().to('cuda')] == 0)
    # 同一地图同一父态重复只用于梯度代数核验，不进入采样流或增加对局数。
    batch = [copy.deepcopy(rows[0]) for _ in range(3)]
    cpu.zero_grad(set_to_none=True)
    gpu.zero_grad(set_to_none=True)
    cx, gx = collate(batch), move(collate(batch), 'cuda:0')
    loss(forward_batch(cpu, cx), cx, batch).backward()
    loss(forward_batch(gpu, gx), gx, batch).backward()
    cg = torch.cat([p.grad.flatten() for p in cpu.parameters()])
    gg = torch.cat([p.grad.cpu().flatten() for p in gpu.parameters()])
    gradient_error = relative(cg, gg)
    assert gradient_error < 1e-4, gradient_error
    micro = copy.deepcopy(gpu)
    micro.zero_grad(set_to_none=True)
    for row in batch:
        x = move(collate([row]), 'cuda:0')
        loss(forward_batch(micro, x), x, [row], 3, 3).backward()
    mg = torch.cat([p.grad.cpu().flatten() for p in micro.parameters()])
    micro_error = relative(gg, mg)
    assert micro_error < 1e-4, micro_error
    # 双掩码为零时，所有参数的梯度贡献必须严格为零。
    masked = copy.deepcopy(rows[0]); masked['policyMask'].zero_(); masked['valueMask'].zero_()
    cpu.zero_grad(set_to_none=True)
    x = collate([masked]); objective = loss(forward_batch(cpu, x), x, [masked]); objective.backward()
    assert float(objective) == 0 and all(torch.count_nonzero(p.grad) == 0 for p in cpu.parameters())
    save(HERE / 'GPU_RUNTIME_VERIFIED.json', dict(passed=True, environment=identity(torch.device('cuda:0')), restore=receipt, gpuRestore=gpu_receipt, parameters=1966910, forward=forward_errors, gradientRelativeL2=gradient_error, microbatchGradientRelativeL2=micro_error, masksZeroContribution=True, activeAllianceTargets=True, candidateSourceMapping=True, optimizerComplete=True, formalUpdates=0, temporaryUpdates=0, seconds=time.perf_counter() - start, sourceSamples=[r['source'] for r in rows]))
    print(json.dumps(dict(passed=True, gradientRelativeL2=gradient_error, microbatchGradientRelativeL2=micro_error)))


if __name__ == '__main__':
    main()
