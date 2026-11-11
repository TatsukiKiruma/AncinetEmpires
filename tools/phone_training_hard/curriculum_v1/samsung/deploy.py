"""测试后下发三星完整离线队列，复用本批测试父局与实际启动账本。"""
from pathlib import Path
import argparse
import datetime as dt
import json
import re
import shutil
import sys
sys.path.insert(0,str(Path(__file__).resolve().parent))
from device import ROOT,TASK,OUT,REMOTE,TEST_REMOTE,DEVICE,call,shell,app,sha,write,text

def load(p):return json.loads(Path(p).read_text(encoding='utf-8'))
def upload(label):
    pack=OUT/label;plan=load(pack/'PLAN.json')
    for rel,h in load(pack/'SOURCE_SHA256.json').items():assert sha(pack/rel)==h,rel
    for w in plan['workers']:assert not shell('pidof '+w['package'],check=False)
    for local,phone in [(pack/'master',plan['remoteRoot'])]+[(pack/w['workerId'],w['remoteRoot']) for w in plan['workers']]:
        shell('test ! -e '+phone);call('push',local,phone)
        actual={p:h for h,p in (line.split(None,1) for line in shell('find '+phone+' -type f -exec sha256sum {} +').splitlines())}
        assert actual=={phone+'/'+str(p.relative_to(local)).replace('\\','/'):sha(p) for p in local.rglob('*') if p.is_file()}
        shell('chmod -R go-w '+phone+'\nchmod 755 '+phone)
        for file in local.glob('*.sh'):shell('sh -n '+phone+'/'+file.name)
    probe=shell('CLASSPATH='+plan['remoteRoot']+'/process-importance.jar app_process /system/bin ProcessImportance --probe')
    assert 'probe_passed' in probe
    return plan,probe
def start(plan):
    r=plan['remoteRoot'];cmd='setsid sh '+r+'/master.sh '+r+' </dev/null >'+r+'/launch.log 2>&1 &'
    shell(cmd)
    return {'utc':dt.datetime.now(dt.timezone.utc).isoformat(),'command':cmd,'device':DEVICE,'remoteRoot':r,'total':plan['total'],'workers':2,'allFilesShaVerified':True,'replay':'disabled_by_user','computerRequired':False}
def tests():
    assert not (OUT/'preflight/DEPLOYED.json').exists()
    plan,probe=upload('preflight')
    fixture=TASK/'synthetic-integrity-tests/valid';target=TEST_REMOTE+'/synthetic-valid'
    call('push',fixture,target);shell('chmod -R a+rX '+target)
    audit=app(plan['workers'][0]['package'],'CLASSPATH='+TEST_REMOTE+'/curriculum-audit.jar app_process /system/bin CurriculumAudit '+target+' '+target+'/config.json')
    assert json.loads(audit)['verified']
    policy=OUT/'preflight/governor-test.sh'
    text(policy,'''#!/system/bin/sh
. "$1/smart_governor.sh"
smart_init 2 0 0
test "$ACTIVE_LIMIT:$RECOVERY_TARGET:$OPERATING_CEILING" = 2:2:2 || exit 11
smart_update 92 300 30 10000000 0 5; test "$ACTIVE_LIMIT" = 1 || exit 12
smart_update 92 300 30 10000000 0 10; test "$ACTIVE_LIMIT" = 0 || exit 13
smart_update 20 300 30 10000000 0 11
smart_update 20 300 30 10000000 0 71; test "$ACTIVE_LIMIT" = 1 || exit 14
smart_update 20 300 30 10000000 0 102; test "$ACTIVE_LIMIT" = 2 || exit 15
smart_update 20 450 30 10000000 0 110; test "$ACTIVE_LIMIT:$RESOURCE_PAUSED" = 0:1 || exit 16
smart_update 20 420 24 10000000 0 120; test "$RESOURCE_PAUSED" = 1 || exit 17
smart_update 20 420 25 2359296 0 130; test "$RESOURCE_PAUSED" = 0 || exit 18
smart_update 20 420 25 2000000 0 140; test "$RESOURCE_PAUSED" = 1 || exit 19
printf 'GOVERNOR_OK\\n'
''')
    call('push',policy,TEST_REMOTE+'/governor-test.sh')
    result=shell('sh '+TEST_REMOTE+'/governor-test.sh '+TEST_REMOTE);assert 'GOVERNOR_OK' in result
    for w in plan['workers']:
        pkg=w['package']
        app(pkg,'if test -f files/collector.bundle.js && test ! -e files/hc7-before-20261028.bundle.js; then cp files/collector.bundle.js files/hc7-before-20261028.bundle.js; fi\nif test -f files/current.json && test ! -e files/hc7-before-20261028.current.json; then cp files/current.json files/hc7-before-20261028.current.json; fi')
    write(OUT/'PRELAUNCH_TESTS.json',{'passed':True,'device':DEVICE,'importanceProbe':probe,'auditAsAppUid':json.loads(audit),'governor':result,'shellSyntax':True,'gameActionsExecuted':0,'replay':'disabled_by_user'})
    receipt=start(plan);write(OUT/'preflight/DEPLOYED.json',receipt);print(json.dumps(receipt,ensure_ascii=False))
def promote():
    assert (OUT/'PREFLIGHT_CONFIRMED.json').is_file() and not (OUT/'production/DEPLOYED.json').exists()
    confirmation=load(OUT/'PREFLIGHT_CONFIRMED.json');assert confirmation['passed']
    previous=load(OUT/'preflight/PLAN.json');state=json.loads(shell('cat '+TEST_REMOTE+'/STATE.json'))
    assert state['phase']=='complete' and state['doneParents']==3 and all(not w['controllerAlive'] for w in state['workers'])
    plan,probe=upload('production');carry=[]
    for w in plan['workers']:
        old=TEST_REMOTE+'-'+w['workerId'];phone=w['remoteRoot']
        for name in ['DONE_SEQS','FINAL_SEQS','STARTED_ATTEMPTS','config-run']:
            shell('if test -d '+old+'/'+name+'; then cp -R '+old+'/'+name+' '+phone+'/'+name+'; fi')
        for name in ['completed.tsv','failure.tsv']:
            shell('if test -f '+old+'/'+name+'; then cp '+old+'/'+name+' '+phone+'/'+name+'; fi')
        done=shell('cat '+phone+'/completed.tsv',check=False)
        for line in done.splitlines():
            seq,parent,attempt,epoch=line.split('\t');assert int(seq) in [1010,1011,1012]
            carry.append({'sequence':int(seq),'parentId':parent,'attemptId':attempt,'worker':w['workerId']})
        shell('chmod -R go-w '+phone)
    assert len(carry)==3
    receipt=start(plan);receipt.update({'preflightParentsCarried':carry,'totalNewQuota':1000,'additionalParents':997,'importanceProbe':probe})
    write(OUT/'production/DEPLOYED.json',receipt);print(json.dumps(receipt,ensure_ascii=False))
if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('action',choices=['test','promote']);a=p.parse_args();{'test':tests,'promote':promote}[a.action]()
