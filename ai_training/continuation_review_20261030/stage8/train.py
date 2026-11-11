"""Stage 8 全人数等权训练；仅消费本阶段训练分区，K1 固定锚定。"""
import os
import sys
from pathlib import Path
import json
import hashlib
import random
import csv
import subprocess
from itertools import islice
from epoch_data import EpochData

HERE = Path(__file__).resolve().parent
DATA = Path('D:/AncientEmpiresData/continuation_stage8_20261110_v1')
os.environ['MIOPEN_USER_DB_PATH'] = str(DATA / 'miopen-fp32-db')
os.environ['MIOPEN_CUSTOM_CACHE_DIR'] = str(DATA / 'cache')
sys.path.insert(0, str(HERE.parent / 'stage7'))
from fp32_forward import forward, torch
from common import load_model, move
from ragged_batch import collate
from train_data import Dataset
from train_metrics import brier_ce, subset
from policy_training import POLICY
from validation_curve import validation


def sha(file):
    return hashlib.sha256(Path(file).read_bytes()).hexdigest()


def save(file, obj):
    tmp = file.with_suffix('.tmp')
    tmp.write_text(json.dumps(obj, ensure_ascii=False, indent=2, allow_nan=False), encoding='utf-8')
    tmp.replace(file)


def main(generation, prefix, expected, probe=False):
    torch.set_num_threads(2)
    torch.manual_seed(2026111008 + generation)
    torch.cuda.manual_seed_all(2026111008 + generation)
    assert sha(prefix + '.bin') == expected
    k1 = str(HERE.parents[2] / 'public/models/dual_v3_stage7_k1/final')
    assert sha(k1 + '.bin') == '81012a047520fe038ca93383a2620c4d89d87d4a825b79025c5dfd8fc121cb2e'
    directory = DATA / f'gen{generation}'
    manifest = json.loads((directory / 'DATASET.json').read_text(encoding='utf-8'))
    assert manifest['sealedAccess'] == 0 and manifest['generation'] == generation
    dataset = Dataset(manifest['pathDb'], manifest['identity'])
    outdir = directory / ('probe-covered3' if probe else f'L{generation}-covered3')
    outdir.mkdir(exist_ok=True)
    jobs = [j for block in range(10) for j in json.loads((directory / f'block-{block}.json').read_text(encoding='utf-8'))]
    coverage = EpochData(dataset,jobs,20261111+generation)
    dev = coverage.validation_panel()
    epochs = 3
    updates = epochs * ((coverage.count+29)//30)
    identity = hashlib.sha256(json.dumps([manifest['identity'], expected, sha(__file__), sha(HERE/'epoch_data.py'),sha(HERE/'validation_curve.py'),updates,coverage.holdout_parents]).encode()).hexdigest()
    if (outdir / 'TRAIN.json').exists():
        receipt = json.loads((outdir / 'TRAIN.json').read_text(encoding='utf-8'))
        assert receipt['identity'] == identity and sha(outdir / 'final.bin') == receipt['sha256']
        return
    model = load_model(prefix).accurate_reductions(False).cuda().eval()
    anchor = load_model(k1).accurate_reductions(False).cuda().eval()
    for p in anchor.parameters():
        p.requires_grad_(False)
    heads, trunk = [], []
    for name, p in model.named_parameters():
        (heads if name.split('.')[0] in ({'value1', 'value_norm', 'value2', 'army_scale'} | POLICY) else trunk).append(p)
    optimizer = torch.optim.AdamW([{'params': heads, 'lr': 3e-5}, {'params': trunk, 'lr': 3e-6}])
    rng = random.Random(2026111008 + generation)
    ckpt = outdir / 'TRAIN_CHECKPOINT.pt'
    start = 0
    if ckpt.exists():
        old = torch.load(ckpt, map_location='cpu', weights_only=False)
        assert old['identity'] == identity
        model.load_state_dict(old['model']); optimizer.load_state_dict(old['optimizer'])
        rng.setstate(old['rng']); start = old['updates']
        torch.set_rng_state(old['torch_rng']); torch.cuda.set_rng_state_all(old['cuda_rng'])
    curvefile=outdir/'validation.csv'
    completed_samples = old.get('completed_samples',0) if ckpt.exists() else 0
    baseline=validation(anchor,anchor,dev)
    def curve(update):
        measured=validation(model,anchor,dev)
        row=dict(update=update,epochs=completed_samples/coverage.count,**measured)
        exists=curvefile.exists()
        with curvefile.open('a',newline='',encoding='utf-8') as f:
            w=csv.DictWriter(f,fieldnames=list(row));
            if not exists: w.writeheader()
            w.writerow(row)
        subprocess.run([os.environ.get('AE_PLOT_PYTHON','C:/Users/SHIINA/anaconda3/python.exe'),str(HERE/'plot_curve.py'),str(curvefile)],check=True)
        save(outdir/'PROGRESS.json',dict(updates=update,target=updates,completedSamples=completed_samples,
             trainingSamples=coverage.count,coverageEpochs=completed_samples/coverage.count,validationSamples=len(dev),baseline=baseline,validation=measured))
        if not probe: (HERE/'STAGE8_REPORT.md').write_text('# Stage 8 实测进度\n\n训练：'+str(completed_samples)+'/'+str(coverage.count*3)+'次样本消费，'+str(update)+'/'+str(updates)+'次更新。\n\n留出验证 '+str(len(dev))+' 样本；K1 / 当前候选：策略损失 '+str(baseline['policy_loss'])+' / '+str(measured['policy_loss'])+'；价值损失 '+str(baseline['value_loss'])+' / '+str(measured['value_loss'])+'；相对K1 KL '+str(measured['kl_to_k1'])+'。\n',encoding='utf-8')
    if start==0: curve(0)
    step=start
    for epoch in range(epochs):
        already=max(0,min(coverage.count,completed_samples-epoch*coverage.count))
        if already==coverage.count: continue
        stream=coverage.epoch(epoch,already)
        while rows:=list(islice(stream,30)):
            if (HERE/'STOP').exists() or (HERE/'DRAIN').exists(): raise RuntimeError('收到停止标记')
            optimizer.zero_grad(set_to_none=True)
            # 微批保持峰值内存有界；每个样本每遍恰好消费一次。
            for begin in range(0,len(rows),10):
                batch=rows[begin:begin+10];x=move(collate(batch),'cuda');result=forward(model,x)
                brier,ce=brier_ce(result,x)
                weights=torch.tensor([coverage.count/(5*coverage.by_players[r['source']['players']]) for r in batch],device='cuda')
                value_loss=((brier+ce)*x['valueMask'].float()*weights).sum()/len(rows)
                policy_terms=[]
                for i,r in enumerate(batch):
                    if r['source']['teacherValid']:
                        w=coverage.count/(5*max(1,coverage.teacher_counts[r['source']['players']]))
                        policy_terms.append(subset(result['logits'][i],r)*w/len(rows))
                policy_loss=sum(policy_terms) if policy_terms else value_loss*0
                with torch.no_grad(): ref=forward(anchor,x)['logits']
                divergence=[]
                for i,r in enumerate(batch):
                    n=len(r['pointers'])
                    if n:
                        p=ref[i,:n].log_softmax(-1);q=result['logits'][i,:n].log_softmax(-1)
                        divergence.append((p.exp()*(p-q)).sum()*weights[i]/len(rows))
                loss=value_loss+policy_loss+.1*sum(divergence)
                assert torch.isfinite(loss).item();loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(),1.,error_if_nonfinite=True);optimizer.step()
            completed_samples+=len(rows);step+=1
            if probe:
                curve(step);save(outdir/'PROBE.json',dict(passed=True,trainingSamples=coverage.count,validationParents=len(coverage.holdout_parents),validationSamples=len(dev),targetUpdates=updates,processed=len(rows),exportedModels=0));return
            if step%100==0 or completed_samples==coverage.count*3:
                tmp=ckpt.with_suffix('.tmp')
                torch.save(dict(identity=identity,model=model.state_dict(),optimizer=optimizer.state_dict(),rng=rng.getstate(),
                    updates=step,completed_samples=completed_samples,torch_rng=torch.get_rng_state(),cuda_rng=torch.cuda.get_rng_state_all()),tmp);tmp.replace(ckpt)
                save(outdir/'PROGRESS.json',dict(updates=step,target=updates,completedSamples=completed_samples,trainingSamples=coverage.count,coverageEpochs=completed_samples/coverage.count))
            if step%1000==0 or completed_samples==coverage.count*3:curve(step)
    assert completed_samples==coverage.count*3 and step==updates
    model.export(outdir / 'final')
    save(outdir / 'TRAIN.json', dict(complete=True, generation=generation, updates=updates, identity=identity,
         prefix=str(outdir / 'final'), sha256=sha(outdir / 'final.bin'), sourceModel=expected, coverageEpochs=3, trainingSamples=coverage.count, heldoutParents=coverage.holdout_parents, validationSamples=len(dev), sealedAccess=0))


if __name__ == '__main__':
    main(int(sys.argv[1]), sys.argv[2], sys.argv[3],len(sys.argv)>4 and sys.argv[4]=='--probe')
