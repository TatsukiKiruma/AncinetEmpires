#!/system/bin/sh
# 手机独立执行两段授权任务，任何错误即结束，不自动重跑。
TASK=/data/local/tmp/aeii-2m-workers-20261024
JOB="$TASK/job"
ROOTFS=/data/local/tmp/aeii-2m-scratch100-20261024/runtime/rootfs
WAKE=aeii-2m-workers-20261024
umask 077
test ! -e "$JOB/CONTROLLER_STARTED.json" || exit 2
TICKS=$(sed 's/.*) //' /proc/$$/stat | awk '{print $20}')
printf '{"pid":%s,"startTicks":%s,"epoch":%s,"computerRequired":false}\n' "$$" "$TICKS" "$(date +%s)" > "$JOB/CONTROLLER_STARTED.json"
if test -w /sys/power/wake_lock; then printf '%s' "$WAKE" > /sys/power/wake_lock; fi
release() {
    touch "$JOB/SESSION_ENDED"
    if test -w /sys/power/wake_unlock; then printf '%s' "$WAKE" > /sys/power/wake_unlock; fi
}
trap release EXIT
sh "$TASK/resource_monitor.sh" </dev/null > "$TASK/logs/resource-monitor.log" 2>&1 &
sleep 2
for WORKERS in 2 3; do
    test ! -e "$JOB/STOP" || exit 2
    if test "$WORKERS" = 3; then
        # 三worker开始前降至35℃以内；冷却等待单独记账，不算训练时间。
        COOL_START=$(date +%s)
        while :; do
            test ! -e "$JOB/STOP" || exit 2
            chroot "$ROOTFS" /opt/torch-env/bin/python -c 'import json,time;from pathlib import Path;r=json.loads(Path("/bench/RESOURCE.json").read_text());raise SystemExit(0 if r.get("valid") and time.time()-r["epoch"]<30 and r["temperatureC"]<=35 else 1)' && break
            NOW=$(date +%s)
            if test $((NOW-COOL_START)) -ge 1800; then
                printf '{"phase":"cooldown_timeout","returncode":3,"epoch":%s}\n' "$NOW" > "$JOB/CONTROLLER_EXIT.json"
                exit 3
            fi
            sleep 10
        done
        printf '{"startEpoch":%s,"endEpoch":%s,"targetTemperatureC":35}\n' "$COOL_START" "$(date +%s)" > "$JOB/COOLDOWN.json"
    fi
    START=$(date +%s)
    chroot "$ROOTFS" /usr/bin/env PATH=/opt/torch-env/bin:/usr/sbin:/usr/bin:/sbin:/bin OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=2 MKL_NUM_THREADS=2 /bin/bash -c "cd /bench && exec nice -n 10 python -u train_workers.py --workers $WORKERS" </dev/null > "$TASK/logs/train-workers$WORKERS.log" 2>&1 &
    TRAINER=$!
    printf '{"pid":%s,"startTicks":%s,"workers":%s}\n' "$TRAINER" "$(sed 's/.*) //' /proc/$TRAINER/stat | awk '{print $20}')" "$WORKERS" > "$JOB/TRAINER_IDENTITY.json"
    wait "$TRAINER"
    CODE=$?
    printf '{"workers":%s,"returncode":%s,"startEpoch":%s,"endEpoch":%s}\n' "$WORKERS" "$CODE" "$START" "$(date +%s)" >> "$JOB/PHASE_TIMES.jsonl"
    if test "$CODE" != 0; then
        printf '{"phase":"worker_error","workers":%s,"returncode":%s,"epoch":%s}\n' "$WORKERS" "$CODE" "$(date +%s)" > "$JOB/CONTROLLER_EXIT.json"
        exit "$CODE"
    fi
done
printf '{"phase":"complete","returncode":0,"epoch":%s,"completedParents":120,"automaticFullTraining":false}\n' "$(date +%s)" > "$JOB/CONTROLLER_EXIT.json"
