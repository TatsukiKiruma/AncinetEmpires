"""在设备上测试真实控制器的次数代码段和分格门禁，不创建游戏对局。"""
from pathlib import Path
import json
import sys
sys.path.insert(0,str(Path(__file__).resolve().parent))
from device import OUT,REMOTE,root,call,write

def main():
    out=OUT/'queue-v5-tests';out.mkdir(exist_ok=False)
    remote='/data/local/tmp/aeii-hard-curriculum7-queue-v5-tests-20261028'
    policy=OUT/'collector-v5/queue_policy.sh'
    controller=(OUT/'collector-v5/controller.sh').read_text(encoding='utf-8')
    start=controller.index('mkdir -p "$TASK_ROOT/STARTED_ATTEMPTS/$SEQ"')
    end=controller.index('        # 资源密钥',start)
    fragment=controller[start:end]
    claim='''#!/system/bin/sh
TASK_ROOT="$1"; SEQ=99; ATTEMPT="$2"; CONFIG="$TASK_ROOT/$ATTEMPT.json"
fatal(){ printf '%s\\n' "$*" >&2; exit 3; }
write_state(){ :; }
printf '{"job":{"parentId":"synthetic-only"}}\\n' > "$CONFIG"
'''+fragment+'\n'
    (out/'claim.sh').write_text(claim,encoding='utf-8',newline='\n')
    script='''#!/system/bin/sh
. "BASE/queue_policy.sh"
for case_name in empty all one_failure whole_cell; do
 GLOBAL_ROOT="BASE/$case_name"
 mkdir -p "$GLOBAL_ROOT" "$GLOBAL_ROOT-w00/DONE_SEQS" "$GLOBAL_ROOT-w00/FINAL_SEQS" "$GLOBAL_ROOT-w01/DONE_SEQS" "$GLOBAL_ROOT-w01/FINAL_SEQS"
 cp BASE/cells.tsv "$GLOBAL_ROOT/OBSERVATION_CELLS.tsv"
 if test "$case_name" != empty; then
  for i in $(seq 1 42); do
   w=w00; test "$((i%2))" != 0 || w=w01; kind=DONE_SEQS
   if test "$case_name" = one_failure && test "$i" = 7; then kind=FINAL_SEQS; fi
   if test "$case_name" = whole_cell && { test "$i" = 7 || test "$i" = 28; }; then kind=FINAL_SEQS; fi
   printf fixture > "$GLOBAL_ROOT-$w/$kind/$i"
  done
 fi
 observation_ready; code=$?
 if test "$case_name" = empty; then test "$code" = 1 || exit 11
 else test "$code" = 0 && test -s "$GLOBAL_ROOT/OBSERVATION_CHECKED.json" || exit 12; fi
 if test "$case_name" = one_failure; then test ! -s "$GLOBAL_ROOT/OBSERVATION_BLOCKED_CELLS.tsv" || exit 13; fi
 if test "$case_name" = whole_cell; then
  grep 'high_tier' "$GLOBAL_ROOT/OBSERVATION_BLOCKED_CELLS.tsv" >/dev/null || exit 14
  blocked_cell BASE/high2.json || exit 15
  blocked_cell BASE/normal2.json && exit 16
 fi
done
GLOBAL_ROOT="BASE/missing-map"; mkdir "$GLOBAL_ROOT"; observation_ready; test "$?" = 2 || exit 17
mkdir -p BASE/budget
# 十份未启动预留配置不能消耗实际启动预算。
for i in $(seq 1 10); do printf reserved > BASE/budget/reserved-$i.json; done
for i in 1 2 3; do sh BASE/claim.sh BASE/budget started-$i || exit 18; done
sh BASE/claim.sh BASE/budget started-4 > BASE/budget/fourth.log 2>&1; test "$?" = 3 || exit 19
test "$(find BASE/budget/STARTED_ATTEMPTS/99 -type f | wc -l | tr -d ' ')" = 3 || exit 20
grep '"runOrdinal":3' BASE/budget/started-3.json >/dev/null || exit 21
printf 'QUEUE_V5_TESTS_OK\\n'
'''.replace('BASE',remote)
    (out/'test.sh').write_text(script,encoding='utf-8',newline='\n')
    (out/'queue_policy.sh').write_bytes(policy.read_bytes())
    (out/'cells.tsv').write_text(''.join(f'{i+1} {cat} {n}\n' for i,(cat,n) in enumerate(( (cat,n) for cat in ['advantage_endgame','building_finish','high_tier','normal','parameter_variant','preset_units','skill'] for n in [2,3,4]))),encoding='utf-8',newline='\n')
    write(out/'high2.json',{'category':'high_tier','actualPlayerCount':2});write(out/'normal2.json',{'category':'normal','actualPlayerCount':2})
    call('push',out,remote)
    output=root('sh '+remote+'/test.sh');assert 'QUEUE_V5_TESTS_OK' in output
    write(OUT/'QUEUE_V5_TESTS.json',{'passed':True,'observationCases':['pending','all42natural','single_failure_does_not_block_cell','two_failed_samples_block_only_affected_cell','missing_contract_rejected'],'actualControllerStartCodeTested':True,'unstartedReservations':10,'acceptedStarts':3,'fourthStartRejected':True,'gameActionsExecuted':0,'replay':'disabled_by_user','output':output})
    print(output)
if __name__=='__main__':main()
