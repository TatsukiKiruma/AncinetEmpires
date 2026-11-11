"""保留失败原件，修正Java Boolean回读；同一父局和尝试计数继续。"""
from pathlib import Path
import json
import re
import sys
sys.path.insert(0,str(Path(__file__).resolve().parent))
from device import OUT,DEPLOY,REMOTE,root,call,sha,write

def main():
    source=OUT/'collector-v3';out=OUT/'repairs/boolean-receipt-v3';out.mkdir(parents=True,exist_ok=False)
    state=json.loads(root('cat '+REMOTE+'/STATE.json'))
    assert state['phase']=='workers_exited' and state['doneParents']==0
    assert all(not w['controllerAlive'] for w in state['workers'])
    write(out/'BEFORE.json',state)
    plan=json.loads((DEPLOY/'PLAN.json').read_text(encoding='utf-8'))
    native=(source/'native_engine.rhino.js').read_text(encoding='utf-8')+'\n'+(source/'projection.rhino.js').read_text(encoding='utf-8')
    revisions=[]
    for worker in plan['workers']:
        wid=worker['workerId'];phone=worker['remoteRoot']
        assert not call('shell','pidof',worker['package'],check=False)
        bundle=(DEPLOY/wid/'collector.bundle.js').read_text(encoding='utf-8')
        pattern=r'const HARD_NATIVE_SOURCE=(.*?);\n'
        assert len(re.findall(pattern,bundle))==1
        bundle=re.sub(pattern,lambda m:'const HARD_NATIVE_SOURCE='+json.dumps(native,ensure_ascii=True)+';\n',bundle)
        local=out/wid;local.mkdir();(local/'collector.bundle.js').write_text(bundle,encoding='utf-8',newline='\n')
        (local/'controller.sh').write_bytes((source/'controller.sh').read_bytes())
        for name in ['collector.bundle.js','controller.sh']:
            before=root('sha256sum '+phone+'/'+name).split()[0]
            assert before==sha(DEPLOY/wid/name)
            tmp='/data/local/tmp/hc7-boolean-v3-'+wid+'-'+name
            call('push',local/name,tmp)
            root('mkdir -p '+phone+'/history/boolean-receipt-v3\nmv '+phone+'/'+name+' '+phone+'/history/boolean-receipt-v3/'+name+'\ncp '+tmp+' '+phone+'/'+name+'\nchown 0:0 '+phone+'/'+name+'\nchmod 644 '+phone+'/'+name)
            assert root('sha256sum '+phone+'/'+name).split()[0]==sha(local/name)
            revisions.append({'worker':wid,'file':name,'beforeSha256':before,'afterSha256':sha(local/name)})
        root('sh -n '+phone+'/controller.sh')
        seqs=[1,3,5] if wid=='w00' else [2]
        for seq in seqs:
            text=root('cat '+phone+'/FINAL_SEQS/'+str(seq));assert 'construction_mismatch' in text
            root('mv '+phone+'/FINAL_SEQS/'+str(seq)+' '+phone+'/history/boolean-receipt-v3/terminal-'+str(seq))
    root('mv '+REMOTE+'/DRAIN '+REMOTE+'/history/DRAIN-boolean-receipt-v3')
    write(out/'REPAIR.json',{'reason':'Java反射Field.get返回Boolean对象，显式按true字符串回读，避免JS对象真值误判','failedAttemptsPreserved':4,'committedActionsInFailedAttempts':0,'terminalMarkersArchived':True,'sameParentSeedAndRequest':True,'sameAttemptPrefix':True,'maxAttemptsStill':3,'revisions':revisions})
    root('setsid sh '+REMOTE+'/master.sh '+REMOTE+' </dev/null >'+REMOTE+'/launch-boolean-receipt-v3.log 2>&1 &')
    print(json.dumps({'repaired':True,'restarted':True,'revisions':len(revisions)},ensure_ascii=False))
if __name__=='__main__':main()
