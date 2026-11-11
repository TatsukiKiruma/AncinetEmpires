"""冻结阶段4选择、预注册合同及阶段3保全身份。"""
from pathlib import Path
import json,hashlib,collections,subprocess,sys
HERE=Path(__file__).resolve().parent;ROOT=HERE.parent.parent;OLD=HERE.parent/'tactical_scale_20261018'
read=lambda p:json.loads(Path(p).read_text(encoding='utf-8-sig'))
sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
def save(n,v):
    p=HERE/n;p.parent.mkdir(parents=True,exist_ok=True)
    with p.open('x',encoding='utf-8') as f:json.dump(v,f,ensure_ascii=False)
if __name__=='__main__':
    assert not (HERE/'selection.json').exists(),'拒绝重写冻结选择'
    prior=read(OLD/'selection.json')['parents'];allp=read(HERE.parent/'sd64x3_phone_20261016/selection.json')['parents'];selected=[]
    for split,count in [('train',480),('validation',120)]:
        take={p['parentId']:p for p in prior if p['split']==split};buckets=collections.defaultdict(list)
        for p in allp:
            if p['split']==split and p['parentId'] not in take:buckets[p['stratum']].append(p)
        for rows in buckets.values():rows.sort(key=lambda p:hashlib.sha256(('stage4-20261018'+p['parentId']).encode()).hexdigest())
        while len(take)<count:
            key=max((k for k,v in buckets.items() if v),key=lambda k:len(buckets[k])/(1+sum(p['stratum']==k for p in take.values())))
            p=buckets[key].pop(0);take[p['parentId']]=p
        selected.extend(sorted(take.values(),key=lambda p:p['parentId']))
    save('selection.json',dict(seed=2026101804,parents=selected,method='原900分区内480/120，保留阶段3全部父局，固定SHA与分层补足'))
    # 不读取Chrome缓存；既有交付清单所列文件及直接研究文件全部按字节冻结。
    manifest=read(OLD/'DELIVERY_MANIFEST.json');paths=set()
    def visit(x):
        if isinstance(x,dict):
            for k,v in x.items():
                p=OLD/k
                if p.is_file():paths.add(p.resolve())
                visit(v)
        elif isinstance(x,list):
            for v in x:visit(v)
    visit(manifest)
    paths.update(p for p in OLD.iterdir() if p.is_file())
    save('PRESERVE.json',{str(p.relative_to(ROOT)):sha(p) for p in sorted(paths)})
    save('preregister.json',dict(trainParents=480,devParents=120,epochs=4,policyWarmStart=sha(OLD/'group-best.json'),winningWeight=1.5,
        calibrationTypes=['wait','end_turn','attack','recruit','capture'],waitTargetWeights=[0.6,0.8,1.0],endTargetWeights=[0.5,0.75,1.0],
        calibrationGates=dict(waitWithOpportunityRatioMax=1.0,endWithRecruitRatioMax=0.8,attackOpportunityNondecreasing=True,top1DropMax=0.01),
        value=dict(naturalEvidenceRequired=True,parentStageBalanced=True,epochs=30,hidden=64,gate='各阶段MSE/Brier优于常数与静态公式，符号准确率/AUC完整披露'),
        search=dict(topK=6,maxNodes=48,maxResponseUnits=3,maxDecisionMs=30000,maxWallMs=600000,deterministicNodeBudget=True,valueMargin=0.03),
        arms=['hierarchical','pure','value_rerank','bounded'],independentEvaluation=False,phoneOperations=0))
    save('TASK_STATE.json',dict(status='running',phase='实现与数据生成',complete=False))
    status=subprocess.run(['git','status','--short'],cwd=ROOT,capture_output=True,check=True)
    (HERE/'initial-git-status.txt').write_bytes(status.stdout)
    print('冻结完成',len(selected),'父局；保全',len(paths),'文件')
