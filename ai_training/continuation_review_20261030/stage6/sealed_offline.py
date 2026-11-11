"""唯一令牌下复核封存329父局；封存结果不反馈训练和候选选择。"""
import collections
from pathlib import Path
import subprocess
from train_policy import HERE, PREFIX, read, save, load_model, sha, torch

def main():
    root = HERE.parents[2]
    # 使用与实战相同的守门函数，先验收令牌、配置、模型和源码，再打开封存缓存。
    subprocess.run(['node', '--import', 'tsx', '--input-type=module', '-e',
                    "import {allowSealed} from './ai_training/continuation_review_20261030/stage6/arena_io.ts'; allowSealed();"], cwd=root, check=True)
    token = read(HERE/'FINAL_TEST_ATTEMPT.json')
    config = read(HERE/f"config-{token['selectedId']}.json")
    cache = Path('D:/AncientEmpiresData/continuation_stage3_20261030_v1/acceptance_mac100k_20261031_v1/sealed-cache/COMPLETE.json')
    manifest = read(cache)
    if manifest['parents'] != 329 or not manifest['sealed']:
        raise ValueError('封存离线面板身份不符')
    save(HERE/'SEALED_OFFLINE_ATTEMPT.json', {'attempts':1,'sealedAccess':1,'cacheSha256':sha(cache),'tokenSha256':sha(HERE/'FINAL_TEST_ATTEMPT.json'),'modelSha256':config['modelVersion']})
    torch.set_num_threads(2)
    model = load_model(config['modelPrefix']).accurate_reductions(True).cuda().eval()
    baseline = load_model(PREFIX).accurate_reductions(True).cuda().eval()
    rows, maximum = [], 0.
    with torch.inference_mode():
        for chunk in manifest['chunks']:
            if sha(chunk['file']) != chunk['sha256']: raise ValueError('封存缓存摘要变化')
            for row in torch.load(chunk['file'],map_location='cpu',weights_only=False):
                source = row['source']
                if source['split'] != 'test': raise ValueError('封存分区错误')
                x = {k:v.cuda() if isinstance(v,torch.Tensor) else v for k,v in row.items()}
                out, before = model(x), baseline(x)
                maximum = max(maximum,float((out['valueProbs']-before['valueProbs']).abs().max()))
                p,t = out['valueProbs'].double(),x['valueTarget'].double()
                raw = out['logits'].double()
                logits = raw + torch.tensor(source['prior'],device='cuda',dtype=torch.float64)
                target = int(row['policyTarget'])
                rows.append({'parentId':source['parentId'],'players':source['players'],'phase':source['phase'],
                             'brier':float(((p-t)**2).sum()),'ce':float(-(t*out['valueLogits'].double().log_softmax(-1)).sum()),
                             'policyNll':float(-logits.log_softmax(-1)[target]),'top1':float(logits.argmax()==target),
                             'rawPolicyNll':float(-raw.log_softmax(-1)[target]),'rawTop1':float(raw.argmax()==target),
                             'points':[(float(p[i]),float(t[i])) for i in range(6) if row['active'][i]]})
    groups = collections.defaultdict(list)
    for row in rows: groups[row['parentId']].append(row)
    if len(groups)!=329 or len(rows)!=manifest['samples']: raise ValueError('封存父局或样本数不符')
    keys=('brier','ce','policyNll','top1','rawPolicyNll','rawTop1')
    metrics={k:sum(sum(r[k] for r in values)/len(values) for values in groups.values())/len(groups) for k in keys}
    bins=[[] for _ in range(10)]
    for row in rows:
        for p,t in row['points']: bins[min(9,int(p*10))].append((p,t))
    bucket=[{'index':i,'count':len(b),'confidence':sum(p for p,t in b)/len(b),'frequency':sum(t for p,t in b)/len(b)} for i,b in enumerate(bins) if b]
    ece=sum(b['count']*abs(b['confidence']-b['frequency']) for b in bucket)/sum(b['count'] for b in bucket)
    save(HERE/'SEALED_OFFLINE_REPORT.json',{'completed':True,'parents':329,'samples':len(rows),'parentEqual':metrics,'slotReliability':{'ece':ece,'bins':bucket},'maxValueAbsDiffFromH1':maximum,'sealedAccess':1,'policyDefinition':'policyNll/top1使用封存缓存原始先验以保持历史可比；raw指标为纯策略头','eceDefinition':'10个等宽置信度桶，槽事件按样本计权；其他总体指标按父局等权'})
    print(metrics,flush=True)

if __name__=='__main__': main()
