"""固定骨干/组内参数，在240训练父局拟合一个wait组偏置，60开发父局按预注册门禁选择。"""
from group_train import HERE,read,save,Policy,batches,objective,evaluate,DT
import torch,json,time,copy,hashlib,numpy as np
contract=read(HERE/'scale-contract.json');plan=read(HERE/'CALIBRATION_PLAN.json');original=read(HERE/'uncalibrated/group-best.json');s=original['schema']
assert hashlib.sha256((HERE/'uncalibrated/group-best.json').read_bytes()).hexdigest()==plan['trunkSha256']
files=contract['files'];train=[f for f in files if f['split']=='train'];dev=[f for f in files if f['split']=='validation'];p=Policy(s,original['weights']);p.eval();start=time.perf_counter()
ds=[];ys=[];ws=[];ces=[]
with torch.no_grad():
    for rows,b in batches(train,s):
        z,g,_=p(b);_,ce=objective(z,g,b)
        wait=b['group_wait'].bool();active=b['group_sizes']>0;nonwait=active&~wait
        mask=wait.any(1)&nonwait.any(1)
        d=torch.logsumexp(g.masked_fill(~wait,-torch.inf),1)-torch.logsumexp(g.masked_fill(~nonwait,-torch.inf),1)
        ds.extend(d[mask].tolist());ys.extend([r['type']=='wait' for r,keep in zip(rows,mask.tolist()) if keep]);ws.extend(b['weight'][mask].tolist());ces.extend(ce[mask].tolist())
d=torch.tensor(ds,dtype=DT);y=torch.tensor(ys,dtype=DT);w=torch.tensor(ws,dtype=DT);ce=torch.tensor(ces,dtype=DT);base_prob=torch.sigmoid(d)
torch.save(dict(d=d,y=y,w=w,ce=ce),HERE/'calibration-training-cache.pt')
uncalibrated=evaluate(p,dev,s);save('calibration-uncalibrated-dev.json',uncalibrated)
results=[];best=None
for alpha in plan['alphas']:
    effective=w*torch.where(y.bool(),torch.full_like(y,alpha),torch.ones_like(y));bias=torch.tensor(0.,dtype=DT);trace=[]
    for iteration in range(20):
        prob=torch.sigmoid(d+bias);gradient=(effective*(prob-y)).sum()/effective.sum();hessian=(effective*prob*(1-prob)).sum()/effective.sum()
        trace.append(dict(iteration=iteration,bias=float(bias),gradient=float(gradient),hessian=float(hessian)))
        if abs(float(gradient))<1e-12:break
        bias=(bias-gradient/hessian.clamp_min(1e-12)).clamp(-12,12)
    # 自动微分独立核对标量优化梯度，所有网络参数保持原位。
    probe=bias.detach().clone().requires_grad_();loss=((ce+torch.logaddexp(torch.log1p(-base_prob),torch.log(base_prob)+probe)-probe*y)*effective).sum()/effective.sum()
    loss.backward();analytic=(effective*(torch.sigmoid(d+bias)-y)).sum()/effective.sum();assert abs(float(probe.grad-analytic))<1e-10
    candidate=copy.deepcopy(original);candidate['schema'].update(version='sd-hierarchical-residual-ln-wait-calibrated-v2',groupWaitBias=float(bias),waitTargetWeight=alpha,additionalCalibrationParameters=1)
    candidate.update(arm='hierarchical-wait-calibrated',calibration=dict(alpha=alpha,fitParents=240,devParents=60,optimizer='PC PyTorch float64一维Newton',iterations=len(trace),trunkFrozen=True,withinFrozen=True,selectionUsesBattleResults=False))
    assert candidate['weights']==original['weights']
    metrics=evaluate(Policy(candidate['schema'],candidate['weights']),dev,candidate['schema']);m=metrics['metrics'];g=plan['gates']
    gates=dict(top1=m['top1']>=g['top1Min'],groupTop1=m['groupTop1']>=g['groupTop1Min'],attack=m['attack_opportunity_rate']>=g['attackOpportunityRateMin'],danger=m['danger_avoidance']>=g['dangerAvoidanceMin'],wait=m['waitWithOpportunity']<=g['waitWithOpportunityMax'],endRecruit=m['endWithRecruit']<=uncalibrated['metrics']['endWithRecruit'])
    name=f"group-calibration-{str(alpha).replace('.','_')}.json";save(name,candidate)
    record=dict(alpha=alpha,bias=float(bias),trace=trace,metrics=metrics,gates=gates,passed=all(gates.values()),path=name,gradientError=abs(float(probe.grad-analytic)));results.append(record);save('calibration-results.live.json',results)
    print(json.dumps(record,ensure_ascii=False),flush=True)
    if record['passed'] and (best is None or metrics['loss']<best['metrics']['loss']):best=record
save('calibration-results.json',dict(results=results,best=best,seconds=time.perf_counter()-start,trainRows=contract['trainRows'],informativeRows=len(d),base=uncalibrated))
assert best is not None,'三组校准均未通过预注册门禁，不能晋升'
selected=read(HERE/best['path']);save('group-calibrated.json',selected)
initial=copy.deepcopy(selected);initial['schema']['groupWaitBias']=0.;initial['calibration']['initialBias']=0.;save('group-calibrated-initial.json',initial)
