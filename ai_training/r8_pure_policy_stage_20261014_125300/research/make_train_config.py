"""每次正式实验保存不可覆盖配置，先检查数据数量和隔离关口。"""
import json,pathlib,sys
S=pathlib.Path(__file__).resolve().parents[1]
name,dataset,init,seed=sys.argv[1:5]
manifest=json.loads((S/f'data/{dataset}/manifest.json').read_text(encoding='utf8'))
assert manifest['splitInputOverlap']==0 and manifest['splitFamilyOverlap']==0
assert manifest['trainCount']>=20000,'未达到目标；需先产生有证据的缩规模决定，禁止默默放行'
assert all(v>=2000 for v in manifest['counts']['train'].values()) and len(manifest['counts']['train'])==7
assert all(v>=8 for v in manifest['groups']['train'].values()) and all(v>=2 for v in manifest['groups']['val'].values())
cfg={'id':name,'train':str(S/f'data/{dataset}/train.jsonl.gz'),'val':str(S/f'data/{dataset}/val.jsonl.gz'),'init':None if init=='scratch' else init,'seed':int(seed),'updates':12000,'batchSize':32,'lr':.0003,'evalEvery':1000,'endTurnFraction':.15,'surrenderWeight':1.,'surrenderMargin':8.,'valueLossWeight':0.,'sampling':'15%端回合+10%招募+75%均匀；完整合法集CE及相对投降margin','selection':'验证零投降优先，再完整验证Top1；DEV决定阶段候选。'}
if len(sys.argv)>5:cfg['updates']=int(sys.argv[5])
p=S/f'configs/train_{name}.json'
with p.open('x',encoding='utf8') as f:json.dump(cfg,f,ensure_ascii=False,indent=2)
print(p)
