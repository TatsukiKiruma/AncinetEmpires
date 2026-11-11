"""只向新根下发三星离线队列，测试父局与启动预算按原件带入正式队列。"""
from pathlib import Path
import argparse
import datetime as dt
import json
from device import OUT,ROOT,REMOTE,TEST_REMOTE,DEVICE,read,sha,write,text,call,shell,app

def upload(label,preflight_active=False):
    pack=OUT/label;plan=read(pack/'PLAN.json')
    for relative,digest in read(pack/'SOURCE_SHA256.json').items():assert sha(pack/relative)==digest,relative
    if preflight_active:
        assert label=='production' and (OUT/'preflight/DEPLOYED.json').exists()
        live=json.loads(shell('cat '+TEST_REMOTE+'/STATE.json'))
        assert {w['package'] for w in live['workers']}=={w['package'] for w in plan['workers']}
        assert all(w['root']==TEST_REMOTE+'-'+w['workerId'] for w in live['workers'])
    else:
        for w in plan['workers']:assert not shell('pidof '+w['package'],check=False)
    for local,remote in [(pack/'master',plan['remoteRoot'])]+[(pack/w['workerId'],w['remoteRoot']) for w in plan['workers']]:
        shell('test ! -e '+remote);call('push',local,remote,timeout=240)
        actual={name:digest for digest,name in (line.split(None,1) for line in shell('find '+remote+' -type f -exec sha256sum {} +',timeout=240).splitlines())}
        expected={remote+'/'+str(p.relative_to(local)).replace('\\','/'):sha(p) for p in local.rglob('*') if p.is_file()}
        assert actual==expected,'下发文件摘要不匹配'
        shell('chmod -R go-w '+remote+'\nchmod 755 '+remote)
        for script in local.glob('*.sh'):shell('sh -n '+remote+'/'+script.name)
        print('上传并核对',label,local.name,len(actual),flush=True)
    return plan

def start(plan):
    root=plan['remoteRoot'];command='setsid sh '+root+'/master.sh '+root+' </dev/null >'+root+'/launch.log 2>&1 &'
    shell(command)
    return {'utc':dt.datetime.now(dt.timezone.utc).isoformat(),'command':command,'device':DEVICE,'remoteRoot':root,'total':plan['total'],'workers':2,'allFilesShaVerified':True,'computerRequired':False,'replay':'disabled_by_user'}

def test():
    assert not (OUT/'preflight/DEPLOYED.json').exists()
    assert read(OUT/'CONTRACTS.json')['passed']
    plan=upload('preflight')
    probe=shell('CLASSPATH='+TEST_REMOTE+'/process-importance.jar app_process /system/bin ProcessImportance --probe')
    assert 'probe_passed' in probe
    fixture=ROOT/'ai_training/hard_curriculum3000_execution_20261027/synthetic-integrity-tests/valid'
    call('push',fixture,TEST_REMOTE+'/synthetic-valid');shell('chmod -R a+rX '+TEST_REMOTE+'/synthetic-valid')
    audit=app(plan['workers'][0]['package'],'CLASSPATH='+TEST_REMOTE+'/curriculum-audit.jar app_process /system/bin CurriculumAudit '+TEST_REMOTE+'/synthetic-valid '+TEST_REMOTE+'/synthetic-valid/config.json')
    assert json.loads(audit)['verified']
    local=OUT/'preflight-policy-test.sh'
    text(local,'''#!/system/bin/sh
BASE="$1"
. "$BASE/queue_policy.sh"
for NAME in pending all_natural one_failure blocked_cell; do
 GLOBAL_ROOT="$BASE/case-$NAME"
 mkdir -p "$GLOBAL_ROOT" "$GLOBAL_ROOT-w00/DONE_SEQS" "$GLOBAL_ROOT-w00/FINAL_SEQS" "$GLOBAL_ROOT-w01/DONE_SEQS" "$GLOBAL_ROOT-w01/FINAL_SEQS"
 cp "$BASE/OBSERVATION_PARENTS.tsv" "$GLOBAL_ROOT/OBSERVATION_PARENTS.tsv"
 cp "$BASE/OBSERVATION_CELLS.tsv" "$GLOBAL_ROOT/OBSERVATION_CELLS.tsv"
 FIRST=$(head -n 1 "$GLOBAL_ROOT/OBSERVATION_PARENTS.tsv" | awk '{print $1}')
 is_observation_parent "$FIRST" || exit 10
 is_observation_parent 999999 && exit 11
 observation_ready; test "$?" = 1 || exit 12
 test "$NAME" != pending || continue
 N=0
 while read -r SEQ WID CAT PLAYERS; do
  N=$((N+1)); KIND=DONE_SEQS
  if test "$NAME" = one_failure && test "$N" = 1; then KIND=FINAL_SEQS; fi
  if test "$NAME" = blocked_cell && { test "$N" = 1 || test "$N" = 22; }; then KIND=FINAL_SEQS; fi
  printf fixture > "$GLOBAL_ROOT-$WID/$KIND/$SEQ"
 done < "$GLOBAL_ROOT/OBSERVATION_PARENTS.tsv"
 observation_ready || exit 13
 if test "$NAME" = blocked_cell; then test "$(wc -l < "$GLOBAL_ROOT/OBSERVATION_BLOCKED_CELLS.tsv")" = 1 || exit 14
 else test ! -s "$GLOBAL_ROOT/OBSERVATION_BLOCKED_CELLS.tsv" || exit 15; fi
done
. "$BASE/smart_governor.sh"
smart_init 2 0 0
smart_update 92 300 90 10000000 0 5; test "$ACTIVE_LIMIT" = 1 || exit 21
smart_update 92 300 90 10000000 0 10; test "$ACTIVE_LIMIT" = 0 || exit 22
smart_update 20 300 90 10000000 0 11
smart_update 20 300 90 10000000 0 71; test "$ACTIVE_LIMIT" = 1 || exit 23
smart_update 20 300 90 10000000 0 102; test "$ACTIVE_LIMIT" = 2 || exit 24
smart_update 20 450 90 10000000 0 110; test "$RESOURCE_PAUSED:$ACTIVE_LIMIT" = 1:0 || exit 25
smart_update 20 420 25 2359296 0 120; test "$RESOURCE_PAUSED" = 0 || exit 26
printf 'SPARSE_QUEUE_AND_GOVERNOR_OK\\n'
''')
    # 门禁与守护的合成夹具位于本次专属目录，不改变正式队列账本。
    policy_root=TEST_REMOTE+'/policy-test';shell('mkdir '+policy_root)
    for name in ['queue_policy.sh','smart_governor.sh']:call('push',OUT/'source'/name,policy_root+'/'+name)
    for name in ['OBSERVATION_PARENTS.tsv','OBSERVATION_CELLS.tsv']:call('push',OUT/'preflight/master'/name,policy_root+'/'+name)
    call('push',local,policy_root+'/test.sh');result=shell('sh '+policy_root+'/test.sh '+policy_root)
    assert 'SPARSE_QUEUE_AND_GOVERNOR_OK' in result
    for w in plan['workers']:
        pkg=w['package']
        app(pkg,'if test -f files/collector.bundle.js && test ! -e files/hgap-before-20261029-v1.bundle.js; then cp files/collector.bundle.js files/hgap-before-20261029-v1.bundle.js; fi\nif test -f files/current.json && test ! -e files/hgap-before-20261029-v1.current.json; then cp files/current.json files/hgap-before-20261029-v1.current.json; fi')
    write(OUT/'PRELAUNCH_TESTS.json',{'passed':True,'importanceProbe':probe,'staticAuditAsAppUid':json.loads(audit),'sparseQueueAndGovernor':result,'gameActionsExecuted':0,'replay':'disabled_by_user'})
    receipt=start(plan);write(OUT/'preflight/DEPLOYED.json',receipt);print(json.dumps(receipt,ensure_ascii=False),flush=True)

def stage():
    assert not (OUT/'production/STAGED.json').exists() and not (OUT/'production/DEPLOYED.json').exists()
    # 只写全新的任务目录；不改测试应用输入，不启动第二套调度。
    plan=upload('production',preflight_active=True)
    write(OUT/'production/STAGED.json',{'staged':True,'utc':dt.datetime.now(dt.timezone.utc).isoformat(),'remoteRoot':REMOTE,'total':1172,'allFilesShaVerified':True,'started':False})
    print(json.dumps({'staged':1172,'started':False,'remoteRoot':REMOTE}),flush=True)

def production():
    assert read(OUT/'PREFLIGHT_CONFIRMED.json')['passed']
    assert not (OUT/'production/DEPLOYED.json').exists()
    state=json.loads(shell('cat '+TEST_REMOTE+'/STATE.json'))
    assert state['phase']=='complete' and state['doneParents']==3 and all(not w['controllerAlive'] for w in state['workers'])
    if (OUT/'production/STAGED.json').exists():
        plan=read(OUT/'production/PLAN.json')
        for w in plan['workers']:assert not shell('pidof '+w['package'],check=False)
        for local,remote in [(OUT/'production/master',REMOTE)]+[(OUT/'production'/w['workerId'],w['remoteRoot']) for w in plan['workers']]:
            actual={name:digest for digest,name in (line.split(None,1) for line in shell('find '+remote+' -type f -exec sha256sum {} +',timeout=240).splitlines())}
            assert actual=={remote+'/'+str(p.relative_to(local)).replace('\\','/'):sha(p) for p in local.rglob('*') if p.is_file()}
    else:plan=upload('production')
    carried=[]
    expected=set(read(OUT/'DISPATCH.json')['preflightSequences'])
    for w in plan['workers']:
        old=TEST_REMOTE+'-'+w['workerId'];remote=w['remoteRoot']
        for name in ['DONE_SEQS','FINAL_SEQS','STARTED_ATTEMPTS','config-run']:
            shell('if test -d '+old+'/'+name+'; then cp -R '+old+'/'+name+' '+remote+'/'+name+'; fi')
        for name in ['completed.tsv','failure.tsv']:
            shell('if test -f '+old+'/'+name+'; then cp '+old+'/'+name+' '+remote+'/'+name+'; fi')
        for line in shell('cat '+remote+'/completed.tsv',check=False).splitlines():
            seq,parent,attempt,epoch=line.split('\t');assert int(seq) in expected
            carried.append({'sequence':int(seq),'parentId':parent,'attemptId':attempt,'worker':w['workerId']})
        shell('chmod -R go-w '+remote)
    assert {r['sequence'] for r in carried}==expected
    receipt=start(plan);receipt.update({'preflightParentsCarried':carried,'additionalParents':1169,'totalParents':1172})
    write(OUT/'production/DEPLOYED.json',receipt);print(json.dumps(receipt,ensure_ascii=False),flush=True)

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('action',choices=['test','stage','production']);args=parser.parse_args()
    {'test':test,'stage':stage,'production':production}[args.action]()
