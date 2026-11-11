"""旧权重在同一最终60父局上只读复算，供训练完成后的配对比较复用。"""
from group_train import HERE,OLD,read,save,base
import hashlib,time
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
contract=read(HERE/'scale-contract.json');dev=[f for f in contract['files'] if f['split']=='validation'];old=read(OLD/'model-best.json');model=base.Policy(old['schema'],old['weights'])
start=time.perf_counter();full=base.evaluate(model,dev,old['schema']);ids={f['parent'] for f in read(OLD/'contract.json')['files'] if f['split']=='validation'}
subset=base.evaluate(model,[f for f in dev if f['parent'] in ids],old['schema'])
save('stage2-scale-dev.json',dict(full=full,original16=subset,modelSha256=sha(OLD/'model-best.json'),contractSha256=sha(HERE/'scale-contract.json'),seconds=time.perf_counter()-start))
