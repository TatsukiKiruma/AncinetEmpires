#!/system/bin/sh
# 从本次故障检查点恢复一次；到累计1000局停止，不自动重试输入错误。
TASK=/data/local/tmp/aeii-2m-continue900-20261024
JOB="$TASK/job"
ROOTFS=/data/local/tmp/aeii-2m-scratch100-20261024/runtime/rootfs
WAKE=aeii-2m-continue900-20261024
umask 077
test ! -e "$JOB/CONTROLLER_STARTED.json" || exit 2
test ! -e "$JOB/SESSION_ENDED" || exit 2
test ! -e "$JOB/output/COMPLETE.json" || exit 2
TICKS=$(sed 's/.*) //' /proc/$$/stat | awk '{print $20}')
printf '{"pid":%s,"startTicks":%s,"epoch":%s,"computerRequired":false,"phase":"repair03_resume"}\n' "$$" "$TICKS" "$(date +%s)" > "$JOB/CONTROLLER_STARTED.json"
release() { touch "$JOB/SESSION_ENDED"; test ! -w /sys/power/wake_unlock || printf '%s' "$WAKE" > /sys/power/wake_unlock; }
trap release EXIT
test ! -w /sys/power/wake_lock || printf '%s' "$WAKE" > /sys/power/wake_lock
sh "$TASK/resource_monitor.sh" </dev/null > "$TASK/logs/resource-monitor-repair03.log" 2>&1 &
printf '%s\n' "$!" > "$JOB/resource-monitor.pid"
sleep 1
START=$(date +%s)
chroot "$ROOTFS" /usr/bin/env PATH=/opt/torch-env/bin:/usr/sbin:/usr/bin:/sbin:/bin OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=2 /bin/bash -c 'cd /continue900 && exec nice -n 10 python -u train_continue.py --resume' > "$TASK/logs/train-repair03.log" 2>&1 &
TRAINER=$!
printf '{"pid":%s,"startTicks":%s,"phase":"repair03_resume"}\n' "$TRAINER" "$(sed 's/.*) //' /proc/$TRAINER/stat | awk '{print $20}')" > "$JOB/TRAINER_IDENTITY.json"
wait "$TRAINER"
CODE=$?
printf '{"phase":"repair03_resume","returncode":%s,"startEpoch":%s,"endEpoch":%s}\n' "$CODE" "$START" "$(date +%s)" >> "$JOB/PHASE_TIMES.jsonl"
printf '{"phase":"ended","returncode":%s,"epoch":%s,"automaticBeyond1000":false}\n' "$CODE" "$(date +%s)" > "$JOB/CONTROLLER_EXIT.json"
exit "$CODE"
