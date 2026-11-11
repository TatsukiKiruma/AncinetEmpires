import json,gzip,pathlib,hashlib
import numpy as np
import torch
from reference import ROOT,s,w,forward,best,encode_record,VW
from spatial_reference import augment,rel_sha


def main():
    manifest=json.loads((ROOT/'probe-manifest.json').read_text(encoding='utf-8'))
    with gzip.open(ROOT/'probe-base.jsonl.gz','rt',encoding='utf-8') as f: base=[json.loads(x) for x in f]
    with gzip.open(ROOT/'probe-encoded.jsonl.gz','rt',encoding='utf-8') as f: encoded=[json.loads(x) for x in f]
    requested={}
    for i,r in enumerate(manifest['rowsManifest']): requested.setdefault(r['sourceFile'],{})[r['sourceLine']]=i
    checked=0
    for source,indices in requested.items():
        path=ROOT.parent.parent/source
        assert hashlib.sha256(path.read_bytes()).hexdigest()==manifest['sourceBindings'][source]
        with gzip.open(path,'rt',encoding='utf-8') as stream:
            for line,raw in enumerate(stream):
                if line not in indices: continue
                i=indices[line];row=json.loads(raw);packet=row['packet']
                assert [encode_record(t,s['token']['keys']) for t in packet['tokens']]==base[i]['tokens']
                assert [encode_record(c,s['candidate']['keys']) for c in packet['candidates']]==base[i]['candidates']
                assert row['target']==base[i]['target'] and row['weight']==base[i]['weight']
                assert packet['groups']==base[i]['groups'] and packet['refs']==base[i]['refs'] and packet['codes']==base[i]['codes']
                checked+=1
    assert checked==len(base)==len(encoded)==1024
    with gzip.open(ROOT/'reference.jsonl.gz','wt',encoding='utf-8') as out:
        for i,(b,x) in enumerate(zip(base,encoded,strict=True)):
            actual=augment(b,s);assert actual==x,(i,'独立空间编码不一致')
            with torch.no_grad(): logits,value=forward(x)
            z=logits.tolist();out.write(json.dumps(dict(logits=z,value=value.item(),best=best(z),relSha256=rel_sha(x)),separators=(',',':'))+'\n')
            if (i+1)%256==0:print(json.dumps(dict(rows=i+1)),flush=True)
    x=encoded[0];logits,_=forward(x);loss=(torch.logsumexp(logits,0)-logits[x['target']])*x['weight'];loss.backward()
    gradient=w.grad.detach().numpy();assert np.all(gradient[VW:]==0)
    selected=sorted(set(np.argsort(np.abs(gradient))[-24:].tolist()+np.linspace(0,len(gradient)-1,24,dtype=int).tolist()))
    errors=[]
    for index in selected:
        weights=w.detach().clone();weights[index]+=1e-6;zp,_=forward(x,weights);lp=(torch.logsumexp(zp,0)-zp[x['target']])*x['weight']
        weights[index]-=2e-6;zm,_=forward(x,weights);lm=(torch.logsumexp(zm,0)-zm[x['target']])*x['weight']
        errors.append(abs(((lp-lm)/2e-6).item()-gradient[index]))
    assert max(errors)<1e-7
    (ROOT/'reference-gradient.json').write_text(json.dumps(gradient.tolist()),encoding='utf-8')
    result=dict(passed=True,rows=len(base),candidates=sum(len(x['candidates']) for x in encoded),loss=loss.item(),finiteDifferenceParameters=len(selected),finiteDifferenceMaxError=max(errors),valueGradientZero=True,optimizerUpdates=0,device='PC只读数值验收',torchVersion=torch.__version__)
    (ROOT/'reference-report.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps(result,ensure_ascii=True),flush=True)


if __name__=='__main__':main()
