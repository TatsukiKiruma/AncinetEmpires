#!/system/bin/sh
# 手机独立评测20局：单局顺序运行，持唤醒锁，结束后释放。
set -e
umask 077
TASK=/data/local/tmp/aeii-2414-arena-20261027
ROOTFS=/data/local/tmp/aeii-2m-scratch100-20261024/runtime/rootfs
test ! -e "$TASK/CONTROLLER_STARTED.json"
mkdir "$TASK/LAUNCH_CLAIMED"
TICKS=$(sed 's/.*) //' /proc/$$/stat | awk '{print $20}')
printf '{"pid":%s,"startTicks":%s,"epoch":%s}\n' "$$" "$TICKS" "$(date +%s)" > "$TASK/CONTROLLER_STARTED.json"
WAKE=aeii-2414-arena-20261027
release() { touch "$TASK/SESSION_ENDED"; test ! -w /sys/power/wake_unlock || printf '%s' "$WAKE" > /sys/power/wake_unlock; }
trap release EXIT
test ! -w /sys/power/wake_lock || printf '%s' "$WAKE" > /sys/power/wake_lock
sh "$TASK/resource_monitor.sh" </dev/null > "$TASK/logs/resource.log" 2>&1 &
sleep 2
chroot "$ROOTFS" /usr/bin/env PATH=/opt/torch-env/bin:/usr/sbin:/usr/bin:/sbin:/bin AEII_ARENA_WORK=/eval2414 OMP_NUM_THREADS=2 OPENBLAS_NUM_THREADS=1 /continue900/node/bin/node /eval2414/arena.bundle.mjs > "$TASK/logs/arena.log" 2>&1 &
EVALUATOR=$!
printf '{"pid":%s,"startTicks":%s}\n' "$EVALUATOR" "$(sed 's/.*) //' /proc/$EVALUATOR/stat | awk '{print $20}')" > "$TASK/EVALUATOR_IDENTITY.json"
set +e
wait "$EVALUATOR"
CODE=$?
printf '{"returncode":%s,"epoch":%s,"trainingStarted":false,"replayValidation":false}\n' "$CODE" "$(date +%s)" > "$TASK/CONTROLLER_EXIT.json"
exit "$CODE"
