"""训练分区拟合五类增量偏置，按开发NLL选择固定网格。"""
from train import *
import json,math,pickle
mode=sys.argv[1] if len(sys.argv)>1 else 'base'
TYPES=stage4.TYPES;gtype=stage4.gtype
model=read(HERE/f'{mode}-policy-best.json');s=model['schema'];p=make_policy(s,model['weights']);contract=read(HERE/'contract.json')
# 数学实现和开发计数复用阶段4校准器；将所有输出重定向到本轮前缀。
originalSave=save

def calibration_batches(files,s,split):
    count=0
    for i,(rows,b) in enumerate(batches(files,s)):
        count+=len(rows)
        if i%128==0:originalSave(f'{mode}-calibration.live.json',dict(split=split,rows=count,expertRows=0))
        yield rows,b
    if mode=='distill' and split=='train':
        assert read(HERE/'expert-summary.json')['passed']
        with (HERE/'expert.pkl').open('rb') as f:extra=pickle.load(f)
        # 专家纠错的2.0权重与训练一致，开发集始终只保留原180父局。
        for i in range(0,len(extra),32):
            rows=extra[i:i+32]
            if i%4096==0:originalSave(f'{mode}-calibration.live.json',dict(split=split,rows=count,expertRows=i+len(rows)))
            yield rows,collate(rows,s,False)
def save(n,v):originalSave(f'{mode}-'+n,v)
scope=dict(globals(),OLD=HERE.parent/'tactical_scale_20261018',TYPES=TYPES,gtype=gtype)
source=(HERE.parent/'tactical_value_search_20261018/calibrate.py').read_text(encoding='utf-8')
source=source[source.index('def cache(split):'):]
source=source.replace('for rows,b in batches(files,s):','for rows,b in calibration_batches(files,s,split):')
source=source.replace("groupidx=[names.index(n) for n in r['actionGroups']]", "nameIndexes={name:i for i,name in enumerate(names)};groupidx=[nameIndexes[n] for n in r['actionGroups']]")
source=source.replace("with (HERE/'calibration-cache.pkl').open('xb')", "with (HERE/f'{mode}-calibration-cache.pkl').open('xb')")
# 保留不加偏置的候选；固定更强收尾网格，不再事后追加网格。
source=source.replace("for wait in [.6,.8,1.]:", "for wait in [.6,.8,1.]:")
source=source.replace("for end in [.5,.75,1.]:", "for end in [.35,.5,1.]:")
source=source.replace("qualified=[r for r in candidates if r['passed']];selected=min(qualified,key=lambda r:r['metrics']['loss']) if qualified else None", "qualified=[r for r in candidates if r['passed']];selected=min(qualified,key=lambda r:r['metrics']['loss']) if qualified else None")
exec(compile(source,str(HERE/'calibrate_policy.py'), 'exec'),scope)
