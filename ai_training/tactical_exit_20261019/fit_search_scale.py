"""按预注册条件NLL校准搜索排序尺度，不消费任何对战胜负。"""
from pathlib import Path
import json,gzip,hashlib,math,collections,sys,shutil,time
HERE=Path(__file__).resolve().parent;MODE=sys.argv[1] if len(sys.argv)>1 else 'teacher';TAG=sys.argv[2] if len(sys.argv)>2 else MODE;EVALTAG=sys.argv[3] if len(sys.argv)>3 else None;DATA=HERE/'search-scale'
def read(p):return json.loads(Path(p).read_text(encoding='utf-8-sig'))
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def save(p,v):Path(p).write_text(json.dumps(v,ensure_ascii=False),encoding='utf-8')
protocolPath=read(HERE/'ACTIVE_SEARCH_PROTOCOL.json')['path'] if (HERE/'ACTIVE_SEARCH_PROTOCOL.json').exists() else 'search_scale_protocol.json'
protocol=read(HERE/protocolPath);selection=read(HERE/'selection.json');partition={p['parentId']:p['split'] for p in selection['parents']};assert collections.Counter(partition.values())=={'train':720,'validation':180}
roots=[];rows=[];receipts=[];modelsha=None;coverage=[]
for lane in range(4):
    rootReceipt=read(DATA/f'roots-{lane}.receipt.json');assert rootReceipt['passed'];coverage+=rootReceipt['coverage']
    r=read(DATA/f'{TAG}-{lane}.receipt.json');assert r['passed'] and r['collectionPriorWeight']==0 and r['branchPolicyCalls']==0
    assert r['protocolSha256']==sha(HERE/protocolPath),'采集与拟合必须使用同一已登记协议'
    if modelsha is None:modelsha=r['modelSha256']
    assert modelsha==r['modelSha256'];receipts.append(dict(path=f'{TAG}-{lane}.receipt.json',sha256=sha(DATA/f'{TAG}-{lane}.receipt.json')))
    for name,digest in r['outputs'].items():assert sha(DATA/name)==digest
    path=DATA/f'{TAG}-{lane}.jsonl.gz';items=[json.loads(line) for line in gzip.decompress(path.read_bytes()).splitlines() if line];assert len(items)==r['roots'];rows+=items
assert set(p['parent'] for p in coverage)==set(partition) and len(coverage)==900
assert all(partition[r['parent']]==r['split'] for r in rows)
evaluationExcluded=[];evaluationIndexSha=None;fitRows=rows
if EVALTAG:
    evaluationFile=DATA/f'evaluation-index-{EVALTAG}.json';evaluation=read(evaluationFile);assert evaluation['passed'];hashFile=DATA/f'evaluation-hashes-{EVALTAG}.txt.gz';assert sha(hashFile)==evaluation['hashFileSha256'];evaluationIndexSha=sha(evaluationFile);evaluationHashes=set(gzip.decompress(hashFile.read_bytes()).decode().splitlines())
    evaluationExcluded=[dict(id=r['id'],split=r['split'],stateHash=r['stateHash']) for r in rows if r['stateHash'] in evaluationHashes];fitRows=[r for r in rows if r['stateHash'] not in evaluationHashes]
# 先固定训练输入身份，再排除开发重复；排重不查看policy目标。
excluded=[];unique=[];seen=set();train_inputs=set()
for r in sorted(fitRows,key=lambda r:(r['split']!='train',r['parent'],r['phase'])):
    key=(r['split'],r['inputHash'])
    if key in seen or r['split']=='validation' and r['inputHash'] in train_inputs:
        excluded.append(dict(id=r['id'],split=r['split'],inputHash=r['inputHash'],reason='根输入表示重复'));continue
    seen.add(key)
    if r['split']=='train':train_inputs.add(r['inputHash'])
    unique.append(r)
assert not {r['inputHash'] for r in unique if r['split']=='validation'}&train_inputs
eligible=[];uncovered=[]
for r in unique:
    safe=[v for v in r['candidates'] if v['complete'] and v['riskKnown'] and not v['commanderLethal'] and not v['actorLethal']]
    target=next((i for i,v in enumerate(safe) if v['code']==r['label']),None)
    if len(safe)<2 or target is None:
        uncovered.append(dict(id=r['id'],split=r['split'],safeCandidates=len(safe),labelCovered=target is not None));continue
    eligible.append(dict(r,safe=safe,target=target))
assert all(any(r['split']==s for r in eligible) for s in ['train','validation'])
counts=collections.Counter((r['parent'],r['phase']) for r in eligible);phases=collections.defaultdict(set)
for r in eligible:phases[r['parent']].add(r['phase'])
for r in eligible:r['normalizedWeight']=r['weight']/counts[(r['parent'],r['phase'])]/len(phases[r['parent']])
def metrics(alpha,split):
    selected=[r for r in eligible if r['split']==split];loss=0.;correct=0;correct_weight=0.;total_weight=0.
    for r in selected:
        scale=0 if 'veto_leaf' in protocol.get('rankingModes',{}) and r.get('rankingMode')=='veto_leaf' else alpha
        scores=[v['score']+scale*v['confidence'] for v in r['safe']];maximum=max(scores);nll=maximum+math.log(math.fsum(math.exp(v-maximum) for v in scores))-scores[r['target']];weight=r['normalizedWeight'];loss+=nll*weight;total_weight+=weight
        best=0
        for i in range(1,len(scores)):
            if scores[i]>scores[best]+1e-10:best=i
        hit=best==r['target'];correct+=int(hit);correct_weight+=weight*hit
    return dict(rows=len(selected),parents=len({r['parent'] for r in selected}),phaseRows=dict(collections.Counter(r['phase'] for r in selected)),nll=loss/total_weight,top1=correct/len(selected),correct=correct,weightedTop1=correct_weight/total_weight,weightSum=total_weight)
candidates=[dict(priorWeight=a,train=metrics(a,'train'),validation=metrics(a,'validation')) for a in protocol['priorWeightCandidates']];baseline=candidates[0]
admitted=[c for c in candidates if c['validation']['top1']>=baseline['validation']['top1']-1e-12];best=admitted[0]
for c in admitted[1:]:
    if c['validation']['nll']<best['validation']['nll']-1e-10:best=c
improved=best['validation']['nll']<baseline['validation']['nll']-1e-6
# 零系数本来就在预注册候选中；最终模型若以零最优，按原选择规则保留而不伪造提升。
passed=best['validation']['nll']<=baseline['validation']['nll']+1e-10 and best['validation']['top1']>=baseline['validation']['top1']-1e-12
result=dict(passed=passed,improved=improved,mode=MODE,collectionTag=TAG,protocolPath=protocolPath,protocolVersion=protocol['version'],protocolSha256=sha(HERE/protocolPath),modelSha256=modelsha,fitterSha256=sha(__file__),roots=len(rows),selectedParents=900,trainParents=720,devParents=180,rootBearingParents=len({r['parent'] for r in rows}),uniqueRoots=len(unique),excludedDuplicates=len(excluded),excludedEvaluationStates=len(evaluationExcluded),evaluationIndexSha256=evaluationIndexSha,conditionalRows=len(eligible),uncoveredRows=len(uncovered),inputSplitOverlap=0,evaluationStateOverlap=0,sourceReceipts=receipts,candidates=candidates,selected=best,baseline=baseline,selectionUsesBattleOutcomes=False,branchPolicyCalls=0,fixedVetoPriorWeight=0 if 'veto_leaf' in protocol.get('rankingModes',{}) else None,rankingModeCounts={split:dict(collections.Counter(r.get('rankingMode','policy_mixed') for r in eligible if r['split']==split)) for split in ['train','validation']},scope='条件安全候选内的离线标签排序指标，不是对战胜率；登记了Veto分域时固定叶子分，普通域才使用校准系数')
save(DATA/f'{TAG}-excluded-evaluation.json',evaluationExcluded);save(DATA/f'{TAG}-excluded-duplicates.json',excluded);save(DATA/f'{TAG}-uncovered-labels.json',uncovered);save(DATA/f'{TAG}-calibration.json',result)
if passed:
    config=HERE/'search_prior_config.ts';before=config.read_bytes();archive=DATA/f'{TAG}-config-before-{int(time.time())}.ts.snapshot';archive.write_bytes(before)
    config.write_text('// 此文件由预注册开发条件NLL校准生成，完整候选与分母见search-scale/'+TAG+'-calibration.json。\nexport const SEARCH_PRIOR_WEIGHT = '+repr(best['priorWeight'])+';\n',encoding='utf-8')
    result.update(configSha256=sha(config),previousConfigSha256=hashlib.sha256(before).hexdigest());save(DATA/f'{TAG}-calibration.json',result)
print(json.dumps(dict(passed=passed,improved=improved,mode=MODE,roots=len(rows),conditionalRows=len(eligible),selected=best,baseline=baseline),ensure_ascii=False));assert passed,'校准选择违反预注册NLL或top1条件'
