"""当前授权任务的阶段控制器；门禁/身份失败即停止，不操作手机。"""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import time

HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[1]
PYTHON=sys.executable
read=lambda p:json.loads(Path(p).read_text(encoding='utf-8-sig'))
sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()

def status(phase,**extra):
    (HERE/'PIPELINE_STATE.json').write_text(json.dumps(dict(phase=phase,at=time.time(),pid=os.getpid(),phoneOperations=0,**extra),ensure_ascii=False),encoding='utf-8')
    print(json.dumps(dict(phase=phase,**extra),ensure_ascii=False),flush=True)

def wait_until(fn,phase):
    status(phase)
    while not fn(): time.sleep(10)

def run(name,command):
    with (HERE/(name+'.log')).open('w',encoding='utf-8') as stream:
        result=subprocess.run(command,cwd=ROOT,stdout=stream,stderr=subprocess.STDOUT)
    if result.returncode: raise RuntimeError(f'{name}退出码{result.returncode}，保留日志')

def python(script,*args):
    return ['node','ai_training/run.mjs',PYTHON,'-X','utf8',f'tactical_conditional_20261018/{script}',*args]

def node(script,*args):
    return ['node','ai_training/run.mjs','node','--max-old-space-size=1400','--import','tsx',f'tactical_conditional_20261018/{script}',*args]

def preserve():
    for filename,digest in read(HERE/'PRESERVE.json').items():
        if sha(filename)!=digest: raise RuntimeError('历史来源身份变化:'+filename)

def parallel(prefix,mode=None,filter_model=None,script='battle.ts'):
    processes=[]
    for lane in range(8):
        stream=(HERE/f'{prefix}-{lane}.log').open('w',encoding='utf-8')
        command=node(script,*([mode] if mode else []),str(lane),'8')
        if filter_model: command.append(filter_model)
        flags=(getattr(subprocess,'BELOW_NORMAL_PRIORITY_CLASS',0)|getattr(subprocess,'CREATE_NO_WINDOW',0))
        process=subprocess.Popen(command,cwd=ROOT,stdout=stream,stderr=subprocess.STDOUT,creationflags=flags)
        processes.append((process,stream))
    for process,stream in processes:
        code=process.wait();stream.close()
        if code: raise RuntimeError(f'{prefix}子进程失败:{code}')

try:
    parents=read(HERE/'selection.json')['parents']
    preserve()
    status('完整光环分支校正v3')
    parallel('correct-v3',script='correct_data.ts')
    status('无损张量缓存')
    run('pack-data',python('pack_data.py'))
    run('packed-gate',python('packed_gate.py'))
    def initial_gate():
        gate=read(HERE/'browser-parity-initial.json')
        return gate.get('passed') and gate.get('modelFileSha256')==sha(HERE/'model-initial.json') and gate.get('inputFileSha256')==sha(HERE/'parity-inputs.json')
    wait_until(initial_gate,'等待v3真实Chrome初始门禁')
    run('freeze-pc-contract',python('freeze.py'))
    bound_names=['train.py','model.ts','encoding.ts','tactics.ts','complete_tactics.ts','threat.ts','sources.ts','policy.ts','compare.py','numeric_gate.py','parity.ts','browser.ts','correct_data.ts']
    bindings={name:sha(HERE/name) for name in bound_names}
    (HERE/'TRAINING_SOURCE.json').write_text(json.dumps(bindings,ensure_ascii=False),encoding='utf-8')
    for arm in ('legacy','new','conditional'):
        if not (HERE/f'training-{arm}.json').exists():
            status('PC训练',arm=arm)
            run('pc-train-'+arm,python('train.py',arm))
        if bindings!={name:sha(HERE/name) for name in bound_names}: raise RuntimeError('训练期间源码变化')
    wait_until(lambda:all((HERE/f"baseline-offline/{p['parentId']}.receipt.json").exists() for p in parents if p['split']=='validation'),'等待冻结基线开发复算')
    status('开发比较与选模')
    run('compare-models',python('compare.py'))
    for arm in ('legacy','new','conditional','best'):
        run('parity-ts-'+arm,node('parity.ts',arm))
        run('parity-python-'+arm,python('numeric_gate.py',arm))
    def browser_gate():
        target=HERE/'browser-parity-best.json'
        if not target.exists(): return False
        gate=read(target)
        return gate.get('passed') and gate.get('modelFileSha256')==sha(HERE/'model-best.json') and gate.get('inputFileSha256')==sha(HERE/'parity-inputs.json')
    wait_until(browser_gate,'等待最佳模型真实Chrome门禁')
    preserve()
    status('最佳模型三档对手实战')
    parallel('battle-best','play','best')
    slots=read(HERE/'battle-plan.json')['slots']
    wait_until(lambda:all((HERE/f"battles/slots/{s['id']}/result.json").exists() for s in slots),'等待固定120槽全部结束')
    status('全动作strict重放')
    parallel('battle-strict-replay','replay')
    preserve()
    status('等待最终报告',completePanels=120,strictReplays=120)
except Exception as error:
    status('error',error=str(error))
    raise
