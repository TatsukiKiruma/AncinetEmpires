#!/system/bin/sh
# 仅训练冻结第一轮剩余414局；累计2414局后保存并停止。
set -e
umask 077
TASK=/data/local/tmp/aeii-2m-continue414-20261027
JOB="$TASK/job"
ROOTFS=/data/local/tmp/aeii-2m-scratch100-20261024/runtime/rootfs
test ! -e "$JOB/CONTROLLER_STARTED.json"
test ! -e "$JOB/STOP"
test ! -e "$JOB/output/COMPLETE.json"
mkdir "$JOB/LAUNCH_CLAIMED"
TICKS=$(sed 's/.*) //' /proc/$$/stat | awk '{print $20}')
printf '{"pid":%s,"startTicks":%s,"epoch":%s,"computerRequired":false}\n' "$$" "$TICKS" "$(date +%s)" > "$JOB/CONTROLLER_STARTED.json"
WAKE=aeii-2m-continue414-20261027
release() { touch "$JOB/SESSION_ENDED"; test ! -w /sys/power/wake_unlock || printf '%s' "$WAKE" > /sys/power/wake_unlock; }
trap release EXIT
test ! -w /sys/power/wake_lock || printf '%s' "$WAKE" > /sys/power/wake_lock
sh "$TASK/resource_monitor.sh" </dev/null > "$TASK/logs/resource-monitor.log" 2>&1 &
printf '%s\n' "$!" > "$JOB/resource-monitor.pid"
sleep 2
START=$(date +%s)
chroot "$ROOTFS" /usr/bin/env PATH=/opt/torch-env/bin:/usr/sbin:/usr/bin:/sbin:/bin OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=2 /bin/bash -c 'cd /continue2414 && exec nice -n 10 python -u train_continue.py' > "$TASK/logs/train.log" 2>&1 &
TRAINER=$!
printf '{"pid":%s,"startTicks":%s,"phase":"continue414"}\n' "$TRAINER" "$(sed 's/.*) //' /proc/$TRAINER/stat | awk '{print $20}')" > "$JOB/TRAINER_IDENTITY.json"
set +e
wait "$TRAINER"
CODE=$?
printf '{"phase":"continue414","returncode":%s,"startEpoch":%s,"endEpoch":%s}\n' "$CODE" "$START" "$(date +%s)" >> "$JOB/PHASE_TIMES.jsonl"
printf '{"phase":"ended","returncode":%s,"epoch":%s,"automaticBeyond2414":false}\n' "$CODE" "$(date +%s)" > "$JOB/CONTROLLER_EXIT.json"
exit "$CODE"
