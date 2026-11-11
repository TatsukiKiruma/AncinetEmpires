"""相同120开发父局、相同宏权重的阶段3/阶段4离线比较。"""
from train import *
files=[f for f in read(HERE/'contract.json')['files'] if f['split']=='validation'];out={}
for name,path in [('stage3',OLD/'group-best.json'),('stage4_uncalibrated',HERE/'policy-best.json'),('stage4_calibrated',HERE/'policy-final.json')]:
    if name=='stage3' and (HERE/'stage3-same-dev.json').exists():out[name]=read(HERE/'stage3-same-dev.json');save('dev-comparison.json',out);continue
    if name=='stage4_uncalibrated':
        model=read(path);epoch=model['epoch'];checkpoint=read(HERE/f'policy-epoch-{epoch}.json')
        assert model['weights']==checkpoint['weights'] and model['schema']==checkpoint['schema']
        out[name]=next(r['dev'] for r in read(HERE/'policy-history.json') if r['epoch']==epoch);save('dev-comparison.json',out);continue
    model=read(path);s=model['schema'];p=stage3.Policy(s,model['weights']) if name=='stage3' else make_policy(s,model['weights']);out[name]=evaluate(p,files,s)
    save('dev-comparison.json',out)
print(json.dumps(out),flush=True)
