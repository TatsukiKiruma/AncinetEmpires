"""验证第二批1001起始编号的设备观察门禁，不运行游戏。"""
from pathlib import Path
import json
import sys
sys.path.insert(0,str(Path(__file__).resolve().parent))
from device import OUT,shell,call,text,write
def main():
    local=OUT/'observation-tests';local.mkdir(exist_ok=False)
    remote='/data/local/tmp/aeii-hard-curriculum7-samsung-observation-tests-20261028'
    (local/'queue_policy.sh').write_bytes((OUT/'source/queue_policy.sh').read_bytes())
    (local/'cells.tsv').write_bytes((OUT/'production/master/OBSERVATION_CELLS.tsv').read_bytes())
    write(local/'high2.json',{'category':'high_tier','actualPlayerCount':2})
    script='''#!/system/bin/sh
. "BASE/queue_policy.sh"
for case_name in all one_failure whole_cell; do
 GLOBAL_ROOT="BASE/$case_name"
 mkdir -p "$GLOBAL_ROOT" "$GLOBAL_ROOT-w00/DONE_SEQS" "$GLOBAL_ROOT-w00/FINAL_SEQS" "$GLOBAL_ROOT-w01/DONE_SEQS" "$GLOBAL_ROOT-w01/FINAL_SEQS"
 cp BASE/cells.tsv "$GLOBAL_ROOT/OBSERVATION_CELLS.tsv"
 observation_ready; test "$?" = 1 || exit 10
 for i in $(seq 1001 1042); do
  w=w00; test "$((i%2))" != 0 || w=w01; kind=DONE_SEQS
  if test "$case_name" = one_failure && test "$i" = 1007; then kind=FINAL_SEQS; fi
  if test "$case_name" = whole_cell && { test "$i" = 1007 || test "$i" = 1028; }; then kind=FINAL_SEQS; fi
  printf fixture > "$GLOBAL_ROOT-$w/$kind/$i"
 done
 observation_ready || exit 11
 test -s "$GLOBAL_ROOT/OBSERVATION_CHECKED.json" || exit 12
 if test "$case_name" = one_failure; then test ! -s "$GLOBAL_ROOT/OBSERVATION_BLOCKED_CELLS.tsv" || exit 13; fi
 if test "$case_name" = whole_cell; then blocked_cell BASE/high2.json || exit 14; fi
done
printf 'OBSERVATION_OFFSET_OK\\n'
'''.replace('BASE',remote)
    text(local/'test.sh',script);call('push',local,remote)
    result=shell('sh '+remote+'/test.sh');assert 'OBSERVATION_OFFSET_OK' in result
    write(OUT/'OBSERVATION_TESTS.json',{'passed':True,'range':[1001,1042],'cases':['pending','42natural','single_failure','whole_cell_failure'],'gameActionsExecuted':0,'replay':'disabled_by_user','output':result})
    print(result)
if __name__=='__main__':main()
