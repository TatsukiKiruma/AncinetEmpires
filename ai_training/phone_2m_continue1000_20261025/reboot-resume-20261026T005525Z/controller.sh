#!/system/bin/sh
# 重启后仅恢复现有本轮检查点，不开启新段或重复受控恢复试验。
set -e
umask 077
TASK=/data/local/tmp/aeii-2m-continue1000-20261025
JOB="$TASK/job"
ROOTFS=/data/local/tmp/aeii-2m-scratch100-20261024/runtime/rootfs
ARCHIVE=/data/local/tmp/aeii-2m-continue1000-20261025/reboot-resume-20261026T005525Z
test "$(cat /proc/sys/kernel/random/boot_id)" = 55be846f-0345-4397-84d7-93ec1baa5b8d
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
printf '{"pid":%s,"startTicks":%s,"epoch":%s,"computerRequired":false,"rebootResume":true}
' "$$" "$TICKS" "$(date +%s)" > "$JOB/CONTROLLER_STARTED.json"
WAKE=aeii-2m-continue1000-20261025
release() { touch "$JOB/SESSION_ENDED"; test ! -w /sys/power/wake_unlock || printf '%s' "$WAKE" > /sys/power/wake_unlock; }
trap release EXIT
test ! -w /sys/power/wake_lock || printf '%s' "$WAKE" > /sys/power/wake_lock
sh "$TASK/resource_monitor.sh" </dev/null > "$ARCHIVE/resource-monitor.log" 2>&1 &
printf '%s
' "$!" > "$JOB/resource-monitor.pid"
sleep 2
START=$(date +%s)
chroot "$ROOTFS" /usr/bin/env PATH=/opt/torch-env/bin:/usr/sbin:/usr/bin:/sbin:/bin OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=2 /bin/bash -c 'cd /continue2000 && exec nice -n 10 python -u train_continue.py --resume' > "$ARCHIVE/train-resume.log" 2>&1 &
TRAINER=$!
printf '{"pid":%s,"startTicks":%s,"phase":"reboot_resume"}
' "$TRAINER" "$(sed 's/.*) //' /proc/$TRAINER/stat | awk '{print $20}')" > "$JOB/TRAINER_IDENTITY.json"
set +e
wait "$TRAINER"
CODE=$?
printf '{"phase":"reboot_resume","returncode":%s,"startEpoch":%s,"endEpoch":%s}
' "$CODE" "$START" "$(date +%s)" >> "$JOB/PHASE_TIMES.jsonl"
printf '{"phase":"ended","returncode":%s,"epoch":%s,"automaticBeyond2000":false}
' "$CODE" "$(date +%s)" > "$JOB/CONTROLLER_EXIT.json"
exit "$CODE"
