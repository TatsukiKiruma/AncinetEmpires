#!/data/data/com.termux/files/usr/bin/bash
# 手机独立控制器：进程互斥、完整安全点重启、完成保存停止。
set -u
umask 077
PREFIX=/data/data/com.termux/files/usr
export PREFIX PATH="$PREFIX/bin:/system/bin" HOME=/data/data/com.termux/files/home TMPDIR="$PREFIX/tmp"
ROOT="$(cd "$(dirname "$0")" && pwd)"
WORK="$ROOT/work"
mkdir -p "$ROOT/logs"
exec 9>"$ROOT/controller.lock"
flock -n 9 || exit 0
test ! -e "$WORK/training/COMPLETE.json" || exit 0
test ! -e "$WORK/STOP" || exit 0
test ! -e "$WORK/training/BLOCKED.json" || exit 1
termux-wake-lock
TICKS=$(awk '{print $22}' "/proc/$$/stat")
printf '{"pid":%s,"startTicks":%s,"epoch":%s,"computerRequired":false,"networkRequired":false}\n' "$$" "$TICKS" "$(date +%s)" > "$ROOT/CONTROLLER_IDENTITY.json"
WATCHER=""
release() {
  test -z "$WATCHER" || kill "$WATCHER" 2>/dev/null || true
  termux-wake-unlock || true
}
trap release EXIT
trap 'touch "$WORK/STOP"' TERM INT
# 父控制器异常退出而旧训练仍存活时，只接管等待，不重复启动。
if test -r "$ROOT/TRAINER_IDENTITY.json"; then
  OLD_PID=$(sed -n 's/.*"pid":\([0-9]*\).*/\1/p' "$ROOT/TRAINER_IDENTITY.json")
  OLD_TICKS=$(sed -n 's/.*"startTicks":\([0-9]*\).*/\1/p' "$ROOT/TRAINER_IDENTITY.json")
  if test -n "$OLD_PID" && test -r "/proc/$OLD_PID/stat"; then
    CURRENT_TICKS=$(awk '{print $22}' "/proc/$OLD_PID/stat")
    if test "$CURRENT_TICKS" = "$OLD_TICKS" && tr '\0' ' ' < "/proc/$OLD_PID/cmdline" | grep -Fq "$ROOT/rootfs"; then
      "$PREFIX/bin/bash" "$ROOT/status_watch.sh" "$OLD_PID" > "$ROOT/logs/notification-adopted-$(date +%s).log" 2>&1 &
      WATCHER=$!
      while kill -0 "$OLD_PID" 2>/dev/null; do sleep 10; done
      kill "$WATCHER" 2>/dev/null || true
      WATCHER=""
    fi
  fi
fi
ATTEMPT=0
while test ! -e "$WORK/training/COMPLETE.json" && test ! -e "$WORK/STOP"; do
  test ! -e "$WORK/training/BLOCKED.json" || break
  ATTEMPT=$((ATTEMPT+1))
  STAMP=$(date +%s)
  "$PREFIX/bin/bash" "$ROOT/guest.sh" /opt/torch-env/bin/python -u /work/train_mobile.py > "$ROOT/logs/train-$STAMP.log" 2>&1 &
  TRAINER=$!
  sleep 1
  if test -r "/proc/$TRAINER/stat"; then TRAIN_TICKS=$(awk '{print $22}' "/proc/$TRAINER/stat"); else TRAIN_TICKS=0; fi
  printf '{"pid":%s,"startTicks":%s,"attempt":%s,"epoch":%s}\n' "$TRAINER" "$TRAIN_TICKS" "$ATTEMPT" "$STAMP" > "$ROOT/TRAINER_IDENTITY.json"
  "$PREFIX/bin/bash" "$ROOT/status_watch.sh" "$TRAINER" > "$ROOT/logs/notification-$STAMP.log" 2>&1 &
  WATCHER=$!
  wait "$TRAINER"
  CODE=$?
  kill "$WATCHER" 2>/dev/null || true
  WATCHER=""
  printf '{"attempt":%s,"returncode":%s,"epoch":%s}\n' "$ATTEMPT" "$CODE" "$(date +%s)" >> "$ROOT/CONTROLLER_ATTEMPTS.jsonl"
  test ! -e "$WORK/training/COMPLETE.json" || break
  test ! -e "$WORK/STOP" || break
  test ! -e "$WORK/training/BLOCKED.json" || break
  if test "$CODE" -eq 0; then break; fi
  # 仅进程中断可重试同一安全点；输入/数值异常由BLOCKED强制停止。
  if test "$ATTEMPT" -ge 3; then
    printf '{"error":"连续三次进程中断，等待检查","epoch":%s}\n' "$(date +%s)" > "$WORK/training/CONTROLLER_BLOCKED.json"
    break
  fi
  sleep 20
done
if test -e "$WORK/training/COMPLETE.json"; then
  DONE=$(sed -n 's/^[[:space:]]*"updates": \([0-9]*\),.*/\1/p' "$WORK/training/COMPLETE.json" | head -1)
  termux-notification --id 91030 --title "远古帝国训练已保存停止" --content "已完成 $DONE 次更新。成果保存在手机；通知电脑后再取回。" --priority low
elif test -e "$WORK/STOP"; then
  termux-notification --id 91030 --title "远古帝国训练已保存暂停" --content "完整断点已保存，可从本机继续。" --priority low --button1 "继续训练" --button1-action "$PREFIX/bin/bash $ROOT/resume.sh"
else
  termux-notification --id 91030 --title "远古帝国训练需要检查" --content "已保留完整断点与错误原件，请连接电脑后通知检查。" --priority low
fi
printf '{"phase":"ended","epoch":%s,"automaticBeyond100k":false}\n' "$(date +%s)" > "$ROOT/CONTROLLER_EXIT.json"
