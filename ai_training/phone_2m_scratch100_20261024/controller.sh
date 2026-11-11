#!/system/bin/sh
# 手机本地两阶段训练；保存退出后只恢复一次，100局完成即结束，无无限错误重启。
TASK=/data/local/tmp/aeii-2m-scratch100-20261024
JOB="$TASK/job"
ROOTFS="$TASK/runtime/rootfs"
LOG="$TASK/logs"
WAKE=aeii-2m-scratch100-20261024
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
sh "$TASK/resource_monitor.sh" </dev/null > "$LOG/resource-monitor.log" 2>&1 &
MONITOR=$!
printf '%s\n' "$MONITOR" > "$JOB/resource-monitor.pid"
sleep 1
PHASE_START=$(date +%s)
chroot "$ROOTFS" /usr/bin/env PATH=/opt/torch-env/bin:/usr/sbin:/usr/bin:/sbin:/bin OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=4 MKL_NUM_THREADS=4 /bin/bash -c 'cd /work && exec nice -n 10 python -u train_phone.py --phase before-resume' > "$LOG/train-before-resume.log" 2>&1 &
TRAINER=$!
printf '{"pid":%s,"startTicks":%s,"phase":"before-resume"}\n' "$TRAINER" "$(sed 's/.*) //' /proc/$TRAINER/stat | awk '{print $20}')" > "$JOB/TRAINER_IDENTITY.json"
wait "$TRAINER"
CODE=$?
printf '{"phase":"before-resume","returncode":%s,"startEpoch":%s,"endEpoch":%s}\n' "$CODE" "$PHASE_START" "$(date +%s)" >> "$JOB/PHASE_TIMES.jsonl"
if test "$CODE" != 75; then
    printf '{"phase":"before-resume","returncode":%s}\n' "$CODE" > "$JOB/CONTROLLER_EXIT.json"
    exit "$CODE"
fi
test ! -e "$JOB/STOP" || exit 0
# 保存恢复来源的独立副本，后续双槽检查点轮换时仍保留本次恢复证据。
chroot "$ROOTFS" /opt/torch-env/bin/python -c 'import json,shutil;from pathlib import Path;p=Path("/work/output");r=json.loads((p/"LATEST.json").read_text());shutil.copyfile(p/r["file"],p/"resume-test-checkpoint.pt");shutil.copyfile(p/"LATEST.json",p/"RESUME_SOURCE.json")' > "$LOG/resume-preservation.log" 2>&1 || exit 2
PHASE_START=$(date +%s)
chroot "$ROOTFS" /usr/bin/env PATH=/opt/torch-env/bin:/usr/sbin:/usr/bin:/sbin:/bin OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=4 MKL_NUM_THREADS=4 /bin/bash -c 'cd /work && exec nice -n 10 python -u train_phone.py --phase continue' > "$LOG/train-continue.log" 2>&1 &
TRAINER=$!
printf '{"pid":%s,"startTicks":%s,"phase":"continue"}\n' "$TRAINER" "$(sed 's/.*) //' /proc/$TRAINER/stat | awk '{print $20}')" > "$JOB/TRAINER_IDENTITY.json"
wait "$TRAINER"
CODE=$?
printf '{"phase":"continue","returncode":%s,"startEpoch":%s,"endEpoch":%s}\n' "$CODE" "$PHASE_START" "$(date +%s)" >> "$JOB/PHASE_TIMES.jsonl"
printf '{"phase":"ended","returncode":%s,"epoch":%s,"automaticFullTraining":false}\n' "$CODE" "$(date +%s)" > "$JOB/CONTROLLER_EXIT.json"
exit "$CODE"
