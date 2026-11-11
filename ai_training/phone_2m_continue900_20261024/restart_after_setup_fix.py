"""首启在新增更新前因日志目录缺失退出，保留现场后补齐目录并重启本任务。"""
import json
from device import HERE,PHONE,root,write

j=PHONE+'/job'
exit_state=json.loads(root('cat '+j+'/CONTROLLER_EXIT.json'))
assert exit_state['returncode']==1
assert root('test ! -f '+j+'/output/LATEST.json && echo no_new_checkpoint')=='no_new_checkpoint'
trainer=json.loads(root('cat '+j+'/TRAINER_IDENTITY.json'))
assert not root('if test -r /proc/'+str(trainer['pid'])+'/stat; then cat /proc/'+str(trainer['pid'])+'/stat; fi',check=False)
command='''set -e
JOB=PHONE/job
test "$(readlink -f "$JOB")" = "$JOB"
test ! -e "$JOB/attempts/start01"
mkdir -p "$JOB/attempts/start01" "$JOB/logs"
for NAME in CONTROLLER_STARTED.json CONTROLLER_EXIT.json TRAINER_IDENTITY.json SESSION_ENDED PHASE_TIMES.jsonl RESOURCE_HISTORY.jsonl RESOURCE.json resource-monitor.pid; do
    test ! -e "$JOB/$NAME" || mv "$JOB/$NAME" "$JOB/attempts/start01/$NAME"
done
test ! -d "$JOB/output" || mv "$JOB/output" "$JOB/attempts/start01/output"
'''.replace('PHONE',PHONE)
root(command)
write(HERE/'repairs/02_LOG_DIRECTORY.json',{'reason':'首启缺少job/logs目录，在任何新增优化器更新前退出；已补齐并归档首启现场','newUpdatesBeforeRepair':0,'preservedPhoneAttempt':j+'/attempts/start01','original100CheckpointUnchanged':True})
print(json.dumps({'preparedRestart':True,'newUpdatesBeforeRepair':0}))
