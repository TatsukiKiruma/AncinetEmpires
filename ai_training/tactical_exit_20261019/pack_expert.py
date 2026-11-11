"""专家样本校验、token去重和无损float32打包。"""
from pathlib import Path
import json,gzip,pickle,hashlib,collections
import numpy as np
from lineage import token_hashes,packet_hash
HERE=Path(__file__).resolve().parent
read=lambda p:json.loads(Path(p).read_text(encoding='utf-8-sig'))
train={p['parentId'] for p in read(HERE/'selection.json')['parents'] if p['split']=='train'};dev={p['parentId'] for p in read(HERE/'selection.json')['parents'] if p['split']=='validation'}
teacherBinding=read(HERE/'expert-session-binding.json')
rows=[];definitions=[];lookup={};results=[];excluded=[];excludedEval=[];devHashes=set();evalHashes=set();riskWitnessAudit=collections.Counter()
evaluationFolder=read(HERE/'teacher-battle-summary.json')['evidenceFolder']
assert teacherBinding['packerSha256']==hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),'打包源码与采样前绑定不同'
evaluationFolders=set()
for name,expected in teacherBinding['evaluationLogs'].items():
    log=HERE/name;assert hashlib.sha256(log.read_bytes()).hexdigest()==expected,'已冻结资格面板轨迹身份改变'
    evaluationFolders.add(log.relative_to(HERE).parts[0])
    # 仅用输入身份排除重叠，不读取评测标签，也不把评测动作作为专家目标。
    with gzip.open(log,'rt',encoding='utf-8') as f:
        evalHashes.update(r['beforeHash'] for r in map(json.loads,f))
for entry in read(HERE/'contract.json')['files']:
    if entry['split']!='validation':continue
    with Path(entry['packedPath']).open('rb') as f:validation=pickle.load(f)
    hashes=token_hashes(validation['tokenTable'])
    devHashes.update(packet_hash(r,hashes) for r in validation['rows'])
for i in range(40):
    folder=HERE/f'expert-games/{i}';result=read(folder/'result.json');replay=read(folder/'strict-replay.json');assert replay['passed'];assert result['classification'] not in ['error','wall_truncation','decision_timeout']
    assert 'riskWitnessAudit' in replay;riskWitnessAudit.update(replay['riskWitnessAudit'])
    results.append(result)
    assert result['teacherModelHash']==teacherBinding['teacherSemanticSha256']
    with gzip.open(folder/'actions.jsonl.gz','rt',encoding='utf-8') as f:actions={r['i']:r for r in map(json.loads,f)}
    with gzip.open(folder/'samples.jsonl.gz','rt',encoding='utf-8') as f:
        for line in f:
            r=json.loads(line);assert r['parent'] in train and r['parent'] not in dev;assert r['codes'][r['target']]==r['teacherCode'];assert r['valueMask'] is False
            actual=actions[r['macro']];assert actual['beforeHash']==r['beforeHash'] and actual['afterHash']==r['afterHash'] and actual['code']==r['teacherCode'] and actual['legalHash']==r['legalHash'];assert r['teacherModelHash']==result['teacherModelHash']
            tokens=[]
            for sparse in r['tokens']:
                key=tuple((int(k),float(v)) for k,v in sparse)
                if key not in lookup:
                    arr=np.zeros(301,dtype=np.float32)
                    for k,v in key:arr[k]=v;assert float(arr[k])==v
                    lookup[key]=len(definitions);definitions.append(arr)
                tokens.append(lookup[key])
            candidates=np.zeros((len(r['codes']),151),dtype=np.float32)
            for j,sparse in enumerate(r['candidates']):
                for k,v in sparse:candidates[j,k]=v;assert float(candidates[j,k])==v
            r.update(tokens=np.array(tokens,dtype=np.int32),candidates=candidates,groups=np.array(r['groups'],dtype=np.int32),refs=np.array(r['refs'],dtype=np.int32),_packed=True);rows.append(r)
table=np.stack(definitions)
hashes=token_hashes(table);accepted=[]
for r in rows:
    fingerprint=packet_hash(r,hashes)
    if r['beforeHash'] in evalHashes:excludedEval.append(dict(game=r['game'],macro=r['macro'],beforeHash=r['beforeHash'],representationSha256=fingerprint));continue
    if fingerprint in devHashes:excluded.append(dict(game=r['game'],macro=r['macro'],beforeHash=r['beforeHash'],representationSha256=fingerprint));continue
    r['_token_table']=table;r['representationSha256']=fingerprint;accepted.append(r)
rows=accepted;assert rows and any(r['corrected'] for r in rows),'专家纠错样本不得为空'
parentOverlap=len({r['parent'] for r in rows}&dev);devOverlap=sum(r['representationSha256'] in devHashes for r in rows);evalOverlap=sum(r['beforeHash'] in evalHashes for r in rows)
assert parentOverlap==devOverlap==evalOverlap==0,'专家与开发/评测输入存在重叠'
with (HERE/'expert.pkl').open('xb') as f:pickle.dump(rows,f,protocol=5)
summary=dict(passed=True,games=40,parents=len({r['parent'] for r in rows}),rows=len(rows),correctionRows=sum(r['corrected'] for r in rows),correctionWeight=2.,devOverlap=parentOverlap,devRepresentationOverlapAfterFilter=devOverlap,evalBeforeHashOverlapAfterFilter=evalOverlap,excludedDevDuplicates=len(excluded),excludedEvalStateHashes=len(excludedEval),evalDistinctStateHashes=len(evalHashes),evaluationFolder=evaluationFolder,devDistinctRepresentations=len(devHashes),strictActions=sum(r['actions'] for r in results),riskWitnessAudit=dict(riskWitnessAudit),classifications={k:sum(r['classification']==k for r in results) for k in {r['classification'] for r in results}},sha256=hashlib.sha256((HERE/'expert.pkl').read_bytes()).hexdigest(),lineage='expert-roots.json + expert-games/*/{result,samples,strict-replay}.json')
(HERE/'expert-excluded-dev-duplicates.json').write_text(json.dumps(excluded),encoding='utf-8')
(HERE/'expert-excluded-eval-states.json').write_text(json.dumps(excludedEval),encoding='utf-8')
summary['teacherSessionBindingSha256']=hashlib.sha256((HERE/'expert-session-binding.json').read_bytes()).hexdigest()
summary['evaluationFolders']=sorted(evaluationFolders);summary['evaluationLogCount']=len(teacherBinding['evaluationLogs'])
(HERE/'expert-summary.json').write_text(json.dumps(summary,ensure_ascii=False),encoding='utf-8');print(json.dumps(summary))
