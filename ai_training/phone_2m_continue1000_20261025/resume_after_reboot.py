"""保存重启现场并从本轮最新完整检查点恢复，预算仍为累计2000局。"""
import datetime as dt
import hashlib
import json
import shlex
from device import HERE, PHONE, root, call, write
from status import process

ROOTFS = '/data/local/tmp/aeii-2m-scratch100-20261024/runtime/rootfs'
JOB = PHONE + '/job'


def main():
    stamp = dt.datetime.now(dt.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    folder = HERE / ('reboot-resume-' + stamp)
    folder.mkdir()
    remote = PHONE + '/reboot-resume-' + stamp
    names = ['CONTROLLER_STARTED.json', 'TRAINER_IDENTITY.json', 'CONTROLLER_EXIT.json',
             'SESSION_ENDED', 'RESOURCE.json', 'output/PROGRESS.json', 'output/LATEST.json',
             'output/WORKERS.json', 'output/RESTORE_VERIFIED.json', 'output/RESUME_SOURCE.json',
             'output/WORKER_RNG_RESTORED.json']
    values = {}
    for name in names:
        raw = root('if test -f ' + JOB + '/' + name + '; then cat ' + JOB + '/' + name + '; fi')
        values[name] = json.loads(raw) if raw and name.endswith('.json') else raw
    assert not root('if test -e ' + JOB + '/STOP -o -e ' + JOB + '/output/COMPLETE.json; then echo blocked; fi'), '存在停止或完成标记'
    workers = values['output/WORKERS.json']
    identities = [values['CONTROLLER_STARTED.json'], values['TRAINER_IDENTITY.json'],
                  workers['coordinator'], *workers['workers'], workers['encoder']]
    current = [process(item) for item in identities]
    assert not any(p['identityMatched'] for p in current), '原任务进程仍在，拒绝重复启动'
    pointer = values['output/LATEST.json']
    assert pointer['file'] in {'checkpoint-0.pt', 'checkpoint-1.pt'}
    assert 0 < pointer['cursor'] < 815544 and pointer['globalStep'] == 99308 + pointer['cursor'] // 8
    assert root('sha256sum ' + JOB + '/output/' + pointer['file']).split()[0] == pointer['sha256']
    boot = root('cat /proc/sys/kernel/random/boot_id')
    write(folder / 'BEFORE.json', {'bootId': boot, 'values': values, 'oldProcesses': current})
    # 先保存旧记录和不可变检查点，再恢复运行时挂载；不改训练源码及输入。
    commands = ['set -e', 'umask 077', 'mkdir ' + remote]
    for name in names:
        commands.append('if test -f ' + JOB + '/' + name + '; then cp -p ' + JOB + '/' + name + ' ' + remote + '/' + name.replace('/', '-') + '; fi')
    commands += ['cp -p ' + JOB + '/output/' + pointer['file'] + ' ' + remote + '/source-checkpoint.pt',
                 'chmod 755 ' + remote,
                 'chmod 644 ' + remote + '/source-checkpoint.pt',
                 'test "$(sha256sum ' + remote + '/source-checkpoint.pt | cut -d " " -f 1)" = ' + pointer['sha256']]
    root('\n'.join(commands), timeout=60)
    transfer = '/data/local/tmp/aeii-reboot-checkpoint-' + stamp + '.pt'
    root('cp ' + remote + '/source-checkpoint.pt ' + transfer + '\nchmod 644 ' + transfer)
    call('pull', transfer, folder / 'source-checkpoint.pt', timeout=60)
    with (folder / 'source-checkpoint.pt').open('rb') as stream:
        assert hashlib.file_digest(stream, 'sha256').hexdigest() == pointer['sha256']
    controller = '''#!/system/bin/sh
# 重启后仅恢复现有本轮检查点，不开启新段或重复受控恢复试验。
set -e
umask 077
TASK=__TASK__
JOB="$TASK/job"
ROOTFS=__ROOTFS__
ARCHIVE=__ARCHIVE__
test "$(cat /proc/sys/kernel/random/boot_id)" = __BOOT__
test ! -e "$ARCHIVE/LAUNCH_CLAIMED"
mkdir "$ARCHIVE/LAUNCH_CLAIMED"
test ! -e "$JOB/STOP"
test ! -e "$JOB/output/COMPLETE.json"
for part in proc dev sys; do
    mkdir -p "$ROOTFS/$part"
    if ! grep -Fq " $ROOTFS/$part " /proc/mounts; then mount -o bind "/$part" "$ROOTFS/$part"; fi
done
mkdir -p "$ROOTFS/continue2000" "$ROOTFS/continue900"
if ! grep -Fq " $ROOTFS/continue2000 " /proc/mounts; then mount -o bind "$JOB" "$ROOTFS/continue2000"; fi
if ! grep -Fq " $ROOTFS/continue900 " /proc/mounts; then mount -o bind /data/local/tmp/aeii-2m-continue900-20261024/job "$ROOTFS/continue900"; fi
# 旧会话结束标记已归档，移走后让原资源守护重新采样。
if test -e "$JOB/SESSION_ENDED"; then mv "$JOB/SESSION_ENDED" "$ARCHIVE/SESSION_ENDED.original"; fi
cp "$ARCHIVE/output-LATEST.json" "$JOB/output/RESUME_SOURCE.json"
TICKS=$(sed 's/.*) //' /proc/$$/stat | awk '{print $20}')
printf '{"pid":%s,"startTicks":%s,"epoch":%s,"computerRequired":false,"rebootResume":true}\n' "$$" "$TICKS" "$(date +%s)" > "$JOB/CONTROLLER_STARTED.json"
WAKE=aeii-2m-continue1000-20261025
release() { touch "$JOB/SESSION_ENDED"; test ! -w /sys/power/wake_unlock || printf '%s' "$WAKE" > /sys/power/wake_unlock; }
trap release EXIT
test ! -w /sys/power/wake_lock || printf '%s' "$WAKE" > /sys/power/wake_lock
sh "$TASK/resource_monitor.sh" </dev/null > "$ARCHIVE/resource-monitor.log" 2>&1 &
printf '%s\n' "$!" > "$JOB/resource-monitor.pid"
sleep 2
START=$(date +%s)
chroot "$ROOTFS" /usr/bin/env PATH=/opt/torch-env/bin:/usr/sbin:/usr/bin:/sbin:/bin OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=2 /bin/bash -c 'cd /continue2000 && exec nice -n 10 python -u train_continue.py --resume' > "$ARCHIVE/train-resume.log" 2>&1 &
TRAINER=$!
printf '{"pid":%s,"startTicks":%s,"phase":"reboot_resume"}\n' "$TRAINER" "$(sed 's/.*) //' /proc/$TRAINER/stat | awk '{print $20}')" > "$JOB/TRAINER_IDENTITY.json"
set +e
wait "$TRAINER"
CODE=$?
printf '{"phase":"reboot_resume","returncode":%s,"startEpoch":%s,"endEpoch":%s}\n' "$CODE" "$START" "$(date +%s)" >> "$JOB/PHASE_TIMES.jsonl"
printf '{"phase":"ended","returncode":%s,"epoch":%s,"automaticBeyond2000":false}\n' "$CODE" "$(date +%s)" > "$JOB/CONTROLLER_EXIT.json"
exit "$CODE"
'''.replace('__TASK__', PHONE).replace('__ROOTFS__', ROOTFS).replace('__ARCHIVE__', remote).replace('__BOOT__', boot)
    local = folder / 'controller.sh'
    local.write_text(controller, encoding='utf-8', newline='\n')
    staged = '/data/local/tmp/aeii-reboot-controller-' + stamp + '.sh'
    call('push', local, staged)
    root('cp ' + staged + ' ' + remote + '/controller.sh\nsh -n ' + remote + '/controller.sh')
    # 原退出记录如存在也先保留，避免查询误判新会话已经结束。
    result = root('set -e\nif test -e ' + JOB + '/CONTROLLER_EXIT.json; then mv ' + JOB + '/CONTROLLER_EXIT.json ' + remote + '/CONTROLLER_EXIT.original.json; fi\nsetsid sh ' + shlex.quote(remote + '/controller.sh') + ' </dev/null > ' + remote + '/controller.log 2>&1 &\necho $!')
    receipt = {'bootId': boot, 'remoteArchive': remote, 'localArchive': str(folder), 'controllerPid': int(result),
               'sourceCheckpoint': pointer, 'workers': 2, 'cumulativeParentBudget': 2000,
               'automaticBeyond2000': False, 'strictReplayExecuted': False}
    write(folder / 'LAUNCHED.json', receipt)
    write(HERE / 'LATEST_REBOOT_RESUME.json', receipt)
    print(json.dumps(receipt, ensure_ascii=False))


if __name__ == '__main__':
    main()
