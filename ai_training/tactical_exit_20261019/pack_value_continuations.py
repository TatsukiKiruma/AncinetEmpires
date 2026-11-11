"""只打包权威strict自然结局Value样本，排除全部开发与已消费评测输入。"""
from train import *
from pathlib import Path
import gzip,json,pickle,hashlib,collections
assert read(HERE/'value-continuation-games-gate.json')['passed']
protocol=read(HERE/'value-continuation-protocol.json');model=read(HERE/'teacher-model.json');sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
assert sha(HERE/'teacher-model.json')==protocol['sourceModelSha256']
policy=make_policy(model['schema'],model['weights']);schema=model['schema'];width=len(schema['token']['keys'])
selection={r['parentId']:r['split'] for r in read(HERE/'selection.json')['parents']};files=read(HERE/'contract.json')['files'];evaluation=read(HERE/'search-scale/evaluation-index-value-continuation-v1.json')
hashPath=HERE/'search-scale/evaluation-hashes-value-continuation-v1.txt.gz';assert sha(hashPath)==evaluation['hashFileSha256'];evalHashes=set(gzip.decompress(hashPath.read_bytes()).decode().splitlines())
def fingerprint(x):return hashlib.sha256(np.asarray(x,dtype='<f4').tobytes()).hexdigest()
def inputs(rows):
    with torch.no_grad():ctx=contexts(policy,token_batch(rows,schema)).tolist()
    return [ctx[i]+r['valueSummary']+[r['valueSummary'][8]-r['valueSummary'][22]] for i,r in enumerate(rows)]
devHashes=set();buffer=[];devCount=0
for r in base.rows_for([f for f in files if f['split']=='validation']):
    buffer.append(r)
    if len(buffer)==128:
        devHashes.update(map(fingerprint,inputs(buffer)));devCount+=len(buffer);buffer=[]
if buffer:devHashes.update(map(fingerprint,inputs(buffer)));devCount+=len(buffer)
assert devCount==61040
rows=[];excluded=[];table=[];lookup={};results=[]
for i in range(40):
    folder=HERE/f'value-continuations/slots/{i}';result=read(folder/'result.json');strict=read(folder/'strict-replay.json');assert strict['passed'] and strict['actions']==result['actions'];results.append(result)
    assert result['sourceModelSha256']==protocol['sourceModelSha256'] and not result['searchUsed'] and not result['policyTargetsCollected']
    with gzip.open(folder/'samples.jsonl.gz','rt',encoding='utf-8') as f:
        for row in map(json.loads,f):
            assert selection[row['parent']]=='train' and row['globalPartition']=='train';assert 'target' not in row
            if result['classification'] not in ['natural_win','natural_loss']:
                excluded.append(dict(game=i,i=row['i'],reason='非可信自然二元结局',classification=result['classification']));continue
            if row['beforeHash'] in evalHashes:excluded.append(dict(game=i,i=row['i'],reason='已消费评测前态'));continue
            ids=[]
            for sparse in row['tokens']:
                dense=np.zeros(width,dtype=np.float32)
                for k,v in sparse:dense[k]=v;assert float(dense[k])==v
                key=dense.tobytes()
                if key not in lookup:lookup[key]=len(table);table.append(dense)
                ids.append(lookup[key])
            row.update(tokens=np.asarray(ids,dtype=np.int32),groups=np.asarray(row['groups'],dtype=np.int32),_packed=True,valueMask=True,valueTarget=1. if row['perspectiveAlliance']==result['winner'] else -1.,weight=1.,game=i)
            rows.append(row)
tokenTable=np.stack(table);accepted=[]
for r in rows:r['_token_table']=tokenTable
for start in range(0,len(rows),128):
    batch=rows[start:start+128]
    for r,x in zip(batch,inputs(batch)):
        key=fingerprint(x)
        if key in devHashes:excluded.append(dict(game=r['game'],i=r['i'],reason='原180开发Value输入表示重复',representationSha256=key));continue
        r.update(x=x,representationSha256=key);accepted.append(r)
assert accepted and {r['valueSplit'] for r in accepted}=={'train','aux_validation'}
with (HERE/'teacher-value-contexts.pkl').open('rb') as f:original=pickle.load(f)
originalParents={r['parent'] for r in original['train']};auxParents={r['parent'] for r in accepted if r['valueSplit']=='aux_validation'};trainParents={r['parent'] for r in accepted if r['valueSplit']=='train'}
assert not auxParents&originalParents and not auxParents&trainParents
assert not {r['parent'] for r in accepted}&{p for p,s in selection.items() if s=='validation'}
for r in accepted:del r['_token_table']
with (HERE/'value-continuations.pkl').open('xb') as f:pickle.dump(dict(tokenTable=tokenTable,rows=accepted),f,protocol=5)
report=dict(passed=True,games=40,strictActions=sum(r['actions'] for r in results),rows=len(accepted),trainRows=sum(r['valueSplit']=='train' for r in accepted),auxValidationRows=sum(r['valueSplit']=='aux_validation' for r in accepted),trainParents=len(trainParents),auxValidationParents=len(auxParents),auxOriginalValueTrainParentOverlap=0,originalDevParentOverlap=0,originalDevValueRepresentationOverlapAfterFilter=0,evaluationBeforeHashOverlapAfterFilter=0,originalDevRowsIndexed=devCount,devDistinctRepresentations=len(devHashes),evaluationStateHashes=len(evalHashes),excluded=len(excluded),classifications=dict(collections.Counter(r['classification'] for r in results)),dataSha256=sha(HERE/'value-continuations.pkl'),protocolSha256=sha(HERE/'value-continuation-protocol.json'),modelSha256=sha(HERE/'teacher-model.json'),searchUsed=False,policyTargetsCollected=False,expertPolicySamples=0)
report.update(packerSha256=sha(Path(__file__)),representation='297维Value输入按float32规范化做保守排重；训练仍保留float64上下文',evaluationIndexSha256=sha(HERE/'search-scale/evaluation-index-value-continuation-v1.json'),originalContractSha256=sha(HERE/'contract.json'))
(HERE/'value-continuation-excluded.json').write_text(json.dumps(excluded,ensure_ascii=False),encoding='utf-8');(HERE/'value-continuation-pack-gate.json').write_text(json.dumps(report,ensure_ascii=False),encoding='utf-8');print(json.dumps(report,ensure_ascii=False))
