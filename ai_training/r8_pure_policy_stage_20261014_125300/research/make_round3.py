"""按预登记分支生成轮3配置，复用完全等价的已有均匀对照。"""
import pathlib,json,hashlib
S=pathlib.Path(__file__).resolve().parents[1]
def read(p):return json.loads(p.read_text(encoding='utf8'))
selection=read(S/'identity/selection_round2.json');parent=selection['selected'];base=read(S/'configs/train_r2_dagger.json')
assert selection['eligible'] and max(r['wins'] for r in selection['rows'])<16
control='r2_dagger' if parent=='r1_warm' else 'r3_control';cfg=dict(base);cfg.update(id=control,init=str(S/f'checkpoints/{parent}/best.json'))
if control=='r2_dagger':assert cfg==base,'已有对照必须字节配置等价'
else:
    with (S/f'configs/train_{control}.json').open('x',encoding='utf8') as f:json.dump(cfg,f,ensure_ascii=False,indent=2)
balanced=dict(cfg);balanced.update(id='r3_balanced',trainer='train_balanced.py',daggerFraction=None,sampling='地图×玩家座位14层等概率；层内15%端回合、10%招募、其余均匀；不额外重加权DAgger来源')
with (S/'configs/train_r3_balanced.json').open('x',encoding='utf8') as f:json.dump(balanced,f,ensure_ascii=False,indent=2)
diff={k:[cfg.get(k),balanced.get(k)] for k in cfg.keys()|balanced.keys() if cfg.get(k)!=balanced.get(k)}
assert set(diff)<=set(['id','trainer','sampling','daggerFraction'])
report={'parent':parent,'control':control,'controlReused':control=='r2_dagger','candidate':'r3_balanced','configDifferences':diff,'updatesEach':12000,'samplesEach':384000,'sameFrozenData':True,'sameWeightInitialization':True,'sameLossAndOptimizer':True,'mainIntervention':'地图座位层的采样分布，源代码完整diff另存','sourceDiffSha256':hashlib.sha256((S/'evidence/train_balanced_source.diff').read_bytes()).hexdigest()}
with (S/'identity/round3_pairing.json').open('x',encoding='utf8') as f:json.dump(report,f,ensure_ascii=False,indent=2)
print(json.dumps(report,ensure_ascii=False,indent=2))
