"""一次前向同时计算三档先验；开发缓存与最终封存缓存严格分离。"""
import argparse
from collections import defaultdict
import json
from pathlib import Path
import time
from core import HERE, STAGE1, DATA, legacy, torch, Encoder, read, save, validate


def summarize(rows):
    parents = defaultdict(list)
    for row in rows:
        parents[row['parentId']].append(row)
    keys = ['policyNll', 'top1', 'valueCe', 'brier', 'valueConfidence', 'valueCorrect']
    means = [{k: sum(r[k] for r in a) / len(a) for k in keys} for a in parents.values()]
    effective = [r for r in rows if r['candidates'] > 1]
    return dict(samples=len(rows), parents=len(parents),
                parentEqual={k: sum(r[k] for r in means) / max(1,len(means)) for k in keys},
                effectivePolicySamples=len(effective),
                effectivePolicyNll=sum(r['policyNll'] for r in effective)/max(1,len(effective)))


def cache(sealed=False):
    folder = DATA / ('sealed-cache' if sealed else 'dev-cache')
    if (folder / 'COMPLETE.json').exists():
        return folder
    if folder.exists():
        raise ValueError('未完成缓存必须保留原件并人工排查，禁止静默跳过')
    folder.mkdir()
    manifest = read(STAGE1 / 'PARTITIONS.json')
    parents = {p['parentId']:p for p in manifest['parents']}
    if sealed:
        if not (HERE / 'FINAL_CANDIDATE_LOCK.json').exists():
            raise ValueError('最终候选未锁定')
        requests = []
        for p in sorted(parents.values(), key=lambda p:p['parentId']):
            if p['corpus'] != 'new' or p['split'] != 'test' or not p['admitted']:
                continue
            for phase in range(3):
                positions = [pos for pos in p['positions'] if pos[2] == phase]
                if positions:
                    macro, sub, _ = positions[len(positions)//2]
                    requests.append(dict(parentId=p['parentId'],macro=macro,sub=sub,choice=0,split='test'))
        save(HERE / 'SEALED_OFFLINE_PANEL.json',dict(parents=329,requests=requests,method='每父局每实际阶段至多一个固定中位原子前态，全部329父局；位置由冻结分区决定'))
    else:
        requests = read(STAGE1 / 'OFFLINE_PANEL.json')['requests']
    encoder = Encoder(folder / 'encoder.stderr.log', sealed)
    chunks, seen = [], set()
    try:
        for offset in range(0,len(requests),32):
            rows = encoder.rows(requests[offset:offset+32], timeout=120)
            for row in rows:
                p = parents[row['source']['parentId']]
                trust = {r['confidence'] for r in p['terrain']}
                row['source']['terrainTrust'] = next(k for k in ['unmapped','approximate','atlas','confirmed'] if k in trust)
                seen.add(p['parentId'])
            path = folder / f'chunk-{offset:05d}.pt'
            torch.save(rows,path)
            chunks.append(dict(file=str(path),sha256=legacy.sha(path),samples=len(rows)))
            save(folder / 'PROGRESS.json',dict(samples=min(offset+32,len(requests)),total=len(requests)))
    finally:
        encoder.close()
    if sealed and len(seen) != 329:
        raise ValueError('封存离线未覆盖329父局')
    save(folder / 'COMPLETE.json',dict(chunks=chunks,samples=len(requests),parents=len(seen),sealed=sealed,
         partitionsSha256=legacy.sha(STAGE1/'PARTITIONS.json')))
    return folder


def evaluate(prefix, destination, device, sealed=False):
    validate()
    started = time.perf_counter()
    destination = Path(destination)
    destination.mkdir(exist_ok=False,parents=True)
    folder = cache(sealed)
    model = legacy.load_model(prefix).to(device).eval()
    records = []
    with torch.inference_mode(), (destination/'samples.jsonl').open('x',encoding='utf-8') as log:
        for chunk in read(folder/'COMPLETE.json')['chunks']:
            if legacy.sha(Path(chunk['file'])) != chunk['sha256']:
                raise ValueError('冻结离线张量摘要不符')
            rows = torch.load(chunk['file'],map_location='cpu',weights_only=False)
            for batch in legacy.groups(rows,8):
                x = legacy.move(legacy.collate(batch),device)
                out = legacy.forward_batch(model,x)
                for i,row in enumerate(batch):
                    a = len(row['pointers'])
                    logits = out['logits'][i,:a]
                    target = int(row['policyTarget'])
                    probs = out['valueProbs'][i]
                    value_target = x['valueTarget'][i]
                    base = dict(row['source'], candidates=a,
                        valueCe=float(-(value_target*out['valueLogits'][i].log_softmax(-1)).sum()),
                        brier=float((probs-value_target).square().sum()),
                        valueConfidence=float(probs.max()),valueCorrect=float(value_target[probs.argmax()]))
                    for scale in [1.,.30,0.]:
                        policy = logits + scale*torch.as_tensor(row['source']['prior'],device=device)
                        record = dict(base,priorScale=scale,policyNll=float(-policy.log_softmax(-1)[target]),top1=int(int(policy.argmax())==target))
                        if not all(math_isfinite(record[k]) for k in ['policyNll','valueCe','brier']):
                            raise ValueError('离线指标非有限')
                        records.append(record)
                        log.write(json.dumps(record,ensure_ascii=False)+'\n')
    buckets = defaultdict(list)
    for r in records:
        base = f'{r["priorScale"]}/{r["corpus"]}/{r["split"]}'
        for key in [base, f'{base}/players/{r["players"]}',f'{base}/category/{r["category"]}',
                    f'{base}/source/{r["source"]}',f'{base}/terrain/{r["terrainTrust"]}',
                    f'{base}/cell/{r["players"]}/{r["category"]}/{r["source"]}/{r["terrainTrust"]}']:
            buckets[key].append(r)
    result = dict(model=str(prefix),modelSha256=legacy.sha(Path(prefix).with_suffix('.bin')),
         samples=len(records)//3,forwardReusedAcrossPriorScales=True,sealed=sealed,
         contractSha256=legacy.sha(HERE/'SCIENCE_CONTRACT.json'),seconds=time.perf_counter()-started,
         buckets={k:summarize(v) for k,v in buckets.items()})
    save(destination/'RESULT.json',result)
    del model
    if device.type=='cuda':
        torch.cuda.empty_cache()
    return result


def math_isfinite(value):
    import math
    return math.isfinite(value)


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--model',type=Path,required=True)
    parser.add_argument('--out',type=Path,required=True)
    parser.add_argument('--sealed',action='store_true')
    args=parser.parse_args()
    torch.set_num_threads(2)
    result=evaluate(args.model,args.out,legacy.device_for('cuda:0'),args.sealed)
    print(json.dumps(dict(samples=result['samples'],seconds=result['seconds'])))
