"""合成文件完整性负例；不创建原生对局、不执行游戏动作。"""
import copy
import gzip
import hashlib
import json
from pathlib import Path
import struct
import sys
sys.path.insert(0,str(Path(__file__).resolve().parent))
from device import OUT,SOURCE,call,root,write

def main():
    local=OUT/'synthetic-integrity-tests';local.mkdir(exist_ok=False)
    remote='/data/local/tmp/aeii-hard-curriculum7-integrity-tests-20261027'
    cases=['valid','sha_corrupt','frame_short','wrong_parent','bad_receipt','missing_rotation','not_natural','missing_thread']
    for case in cases:
        d=local/case;d.mkdir();job={'parentId':'synthetic-file-fixture','attemptId':case}
        write(d/'config.json',{'job':job})
        for f in ['config.bin','initial.bin','final.bin']:(d/f).write_bytes(b'not-a-native-snapshot')
        write(d/'requested-initial-state.json',{'fixture':True})
        write(d/'initial-state-receipt.json',{'parentId':job['parentId'],'verified':case!='bad_receipt'})
        write(d/'result.json',{**job,'actions':1,'naturalEnd':case!='not_natural','allInitialPlayersObserved':case!='missing_rotation'})
        if case!='missing_thread':write(d/'THREAD_EXITED.json',job)
        action={**job,'index':0,'path':'hard_js_primary'}
        if case=='wrong_parent':action['parentId']='wrong'
        (d/'actions.jsonl.gz').write_bytes(gzip.compress((json.dumps(action)+'\n').encode()))
        (d/'states.bin.gz').write_bytes(gzip.compress(struct.pack('>i',10)+b'fixture10!'[:(2 if case=='frame_short' else 10)]))
        names=['config.bin','initial.bin','final.bin','requested-initial-state.json','initial-state-receipt.json','result.json','actions.jsonl.gz','states.bin.gz']
        write(d/'artifact-manifest.json',{**job,'files':[{'name':f,'bytes':(d/f).stat().st_size,'sha256':hashlib.sha256((d/f).read_bytes()).hexdigest()} for f in names]})
        if case=='sha_corrupt':(d/'config.bin').write_bytes(b'changed')
    call('push',local,remote)
    call('push',SOURCE/'curriculum-audit.jar',remote+'/audit.jar')
    call('push',SOURCE/'controller.sh',remote+'/controller.sh')
    call('push',SOURCE/'master.sh',remote+'/master.sh')
    call('push',SOURCE/'queue_policy.sh',remote+'/queue_policy.sh')
    root('sh -n '+remote+'/controller.sh\nsh -n '+remote+'/master.sh\nsh -n '+remote+'/queue_policy.sh')
    results=[]
    for case in cases:
        cmd=f'CLASSPATH={remote}/audit.jar app_process /system/bin CurriculumAudit {remote}/{case} {remote}/{case}/config.json'
        output=root(cmd+' 2>&1\nprintf "\\nAUDIT_EXIT=%s\\n" "$?"',check=False)
        passed='AUDIT_EXIT=0' in output
        assert passed==(case=='valid'),(case,output)
        results.append({'case':case,'accepted':passed,'expectedAccepted':case=='valid','output':output})
    script='''#!/system/bin/sh
. "BASE/queue_policy.sh"
for reason in truncated stopped construction_mismatch log_integrity_failure; do terminal_reason "$reason" || exit 11; done
for reason in app_disappeared inject_disappeared no_state_90s; do terminal_reason "$reason" && exit 12; done
GLOBAL_ROOT="BASE/policy-complete"
mkdir -p "$GLOBAL_ROOT" "$GLOBAL_ROOT-w00/DONE_SEQS" "$GLOBAL_ROOT-w01/DONE_SEQS"
observation_ready; test "$?" = 1 || exit 13
for i in $(seq 1 42); do w=w00; test "$((i%2))" != 0 || w=w01; printf fixture > "$GLOBAL_ROOT-$w/DONE_SEQS/$i"; done
observation_ready || exit 14
test -f "$GLOBAL_ROOT/OBSERVATION_PASSED.json" || exit 15
GLOBAL_ROOT="BASE/policy-gap"
mkdir -p "$GLOBAL_ROOT" "$GLOBAL_ROOT-w00/FINAL_SEQS" "$GLOBAL_ROOT-w01/FINAL_SEQS"
printf fixture > "$GLOBAL_ROOT-w01/FINAL_SEQS/2"
observation_ready; test "$?" = 2 || exit 16
test -f "$GLOBAL_ROOT/OBSERVATION_FAILED" || exit 17
printf 'POLICY_OK\\n'
'''.replace('BASE',remote)
    p=local/'policy-test.sh';p.write_text(script,encoding='utf-8',newline='\n');call('push',p,remote+'/policy-test.sh')
    output=root('sh '+remote+'/policy-test.sh');assert 'POLICY_OK' in output
    write(OUT/'SYNTHETIC_INTEGRITY_TESTS.json',{'passed':True,'cases':results,'queuePolicy':output,'gameActionsExecuted':0,'replay':'disabled_by_user'})
    print(json.dumps({'passed':True,'integrityCases':len(cases),'queuePolicy':'passed'}))
if __name__=='__main__':main()
