"""区分原始历史模型与研究重导出的文件身份及数值身份。"""
import pathlib,json,hashlib
S=pathlib.Path(__file__).resolve().parents[1];R=S.parents[1]
paths=[R/'ai_training/v19/out/run_20260929_v19_02/experiments/ppo_w1/s42/ppo_w1.json',R/'ai_training/r7_training_stage_20261014_083500/artifacts/models/theta1_baseline.json']
a,b=[json.loads(p.read_text(encoding='utf8')) for p in paths];rows=[]
for k in ['stem','res1_1','res1_2','res2_1','res2_2','valDense1','valDense2','polDense1','polDense2']:
    for field in ['weights','biases']:
        aa,bb=a[k][field],b[k][field];assert len(aa)==len(bb);rows.append({'tensor':k+'.'+field,'length':len(aa),'equal':aa==bb,'maxAbsDiff':max(abs(x-y) for x,y in zip(aa,bb))})
out={'paths':[str(p) for p in paths],'sha256':[hashlib.sha256(p.read_bytes()).hexdigest() for p in paths],'numericWeightsEqual':all(r['equal'] for r in rows),'rows':rows,'metadataA':{k:v for k,v in a.items() if not isinstance(v,dict)},'metadataB':{k:v for k,v in b.items() if not isinstance(v,dict)}}
(S/'identity/theta1_origin_comparison.json').write_text(json.dumps(out,ensure_ascii=False,indent=2),encoding='utf8');print(json.dumps(out,ensure_ascii=False,indent=2))
