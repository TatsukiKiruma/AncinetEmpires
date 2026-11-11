#!/system/bin/sh
# 追加第1001—2000局的手机本地任务；仅一次受控恢复，达到2000局累计预算后退出。
TASK=/data/local/tmp/aeii-2m-continue1000-20261025
JOB="$TASK/job"
ROOTFS=/data/local/tmp/aeii-2m-scratch100-20261024/runtime/rootfs
WAKE=aeii-2m-continue1000-20261025
umask 077
test ! -e "$JOB/CONTROLLER_STARTED.json" || exit 2
TICKS=$(sed 's/.*) //' /proc/$$/stat | awk '{print $20}')
printf '{"pid":%s,"startTicks":%s,"epoch":%s,"computerRequired":false}\n' "$$" "$TICKS" "$(date +%s)" > "$JOB/CONTROLLER_STARTED.json"
release() { touch "$JOB/SESSION_ENDED"; test ! -w /sys/power/wake_unlock || printf '%s' "$WAKE" > /sys/power/wake_unlock; }
trap release EXIT
test ! -w /sys/power/wake_lock || printf '%s' "$WAKE" > /sys/power/wake_lock
sh "$TASK/resource_monitor.sh" </dev/null > "$TASK/logs/resource-monitor.log" 2>&1 &
printf '%s\n' "$!" > "$JOB/resource-monitor.pid"
sleep 1
START=$(date +%s)
chroot "$ROOTFS" /usr/bin/env PATH=/opt/torch-env/bin:/usr/sbin:/usr/bin:/sbin:/bin OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=2 /bin/bash -c 'cd /continue2000 && exec nice -n 10 python -u train_continue.py' > "$TASK/logs/train-start.log" 2>&1 &
TRAINER=$!
printf '{"pid":%s,"startTicks":%s,"phase":"start"}\n' "$TRAINER" "$(sed 's/.*) //' /proc/$TRAINER/stat | awk '{print $20}')" > "$JOB/TRAINER_IDENTITY.json"
wait "$TRAINER"
CODE=$?
printf '{"phase":"start","returncode":%s,"startEpoch":%s,"endEpoch":%s}\n' "$CODE" "$START" "$(date +%s)" >> "$JOB/PHASE_TIMES.jsonl"
if test "$CODE" != 75; then printf '{"phase":"start","returncode":%s,"epoch":%s}\n' "$CODE" "$(date +%s)" > "$JOB/CONTROLLER_EXIT.json"; exit "$CODE"; fi
test ! -e "$JOB/STOP" || exit 0
chroot "$ROOTFS" /opt/torch-env/bin/python -c 'import json,shutil;from pathlib import Path;p=Path("/continue2000/output");r=json.loads((p/"LATEST.json").read_text());shutil.copyfile(p/r["file"],p/"resume-test-checkpoint.pt");shutil.copyfile(p/"LATEST.json",p/"RESUME_SOURCE.json")' > "$TASK/logs/resume-copy.log" 2>&1 || exit 2
START=$(date +%s)
chroot "$ROOTFS" /usr/bin/env PATH=/opt/torch-env/bin:/usr/sbin:/usr/bin:/sbin:/bin OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=2 /bin/bash -c 'cd /continue2000 && exec nice -n 10 python -u train_continue.py --resume' > "$TASK/logs/train-resume.log" 2>&1 &
TRAINER=$!
printf '{"pid":%s,"startTicks":%s,"phase":"resume"}\n' "$TRAINER" "$(sed 's/.*) //' /proc/$TRAINER/stat | awk '{print $20}')" > "$JOB/TRAINER_IDENTITY.json"
wait "$TRAINER"
CODE=$?
printf '{"phase":"resume","returncode":%s,"startEpoch":%s,"endEpoch":%s}\n' "$CODE" "$START" "$(date +%s)" >> "$JOB/PHASE_TIMES.jsonl"
printf '{"phase":"ended","returncode":%s,"epoch":%s,"automaticBeyond2000":false}\n' "$CODE" "$(date +%s)" > "$JOB/CONTROLLER_EXIT.json"
exit "$CODE"
