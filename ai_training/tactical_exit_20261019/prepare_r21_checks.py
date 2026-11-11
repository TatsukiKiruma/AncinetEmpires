"""准备新源码的数值参考；保持所有输入、模型和既有失败证据。"""
from pathlib import Path
import json,subprocess,time,shutil,hashlib
HERE=Path(__file__).resolve().parent;ROOT=HERE.parent.parent;REV=HERE/'revisions/r21';PY=r'C:/Users/SHIINA/AppData/Local/Programs/Python/Python312/python.exe'
def run(args,label):
    log=REV/f'{label}-{time.time_ns()}.log'
    with log.open('x',encoding='utf-8') as out:r=subprocess.run(args,cwd=ROOT,stdout=out,stderr=subprocess.STDOUT,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
    assert r.returncode==0,log
    print(label,'通过',flush=True)
def ts(n,*a):return ['node','ai_training/run.mjs','node','--import','tsx','tactical_exit_20261019/'+n,*a]
def py(n,*a):return ['node','ai_training/run.mjs',PY,'-X','utf8','tactical_exit_20261019/'+n,*a]
protocol=HERE/'search_scale_protocol_v9_safe_completion.json';original=protocol.read_bytes()
with (REV/'protocol-v9-initial.snapshot').open('xb') as out:out.write(original)
p=json.loads(original);p.update(version='search-scale-v9-safe-completion',executeAfter='R20完整150槽失败且全部85104实际动作/348103风险见证strict收尾',purpose='冻结03353a53全部Policy与Value权重，修复已枚举的同actor安全完结遗漏，省去不相关的规则/候选/快照工作；重新校准并完整验收')
p['deterministicFix']['performance']='权威普通移动有序子集、共享几何的局内路径缓存、精确标量规则读取、事件字段独立复制、wait数量同源就绪计数与已有隔离快照复用；151维和物理风险须与R20完全一致'
protocol.write_text(json.dumps(p,ensure_ascii=False),encoding='utf-8');(HERE/'ACTIVE_SEARCH_PROTOCOL.json').write_text(json.dumps(dict(path=protocol.name,sha256=hashlib.sha256(protocol.read_bytes()).hexdigest())),encoding='utf-8')
for name in ['initial','teacher','proposal']:
    for prefix in ['numeric-model','python','numeric']:
        source=HERE/f'{prefix}-{name}.json'
        if source.exists():shutil.copy2(source,REV/(source.name+'.before.snapshot'))
    run(py('parity.py',name),'pytorch-'+name);run(ts('gates.ts',name),'standalone-numeric-'+name)
run(ts('proposal_reuse_regression.ts'),'proposal-shared-encoding')
run(ts('standalone_value_parity.ts'),'value-standalone')
run(['node','ai_training/run.mjs','node','tactical_exit_20261019/verify_cache.mjs','r21'],'focus-cold-warm-mutation')
print('数值参考准备完成；仍须初始、教师及提议三个模型实际Chrome、全部前置复核与完整150槽',flush=True)
