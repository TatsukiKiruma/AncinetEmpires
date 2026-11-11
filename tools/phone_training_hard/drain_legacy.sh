#!/system/bin/sh
# 等原单进程队列在途父局自然结束，再请求退出；不重启、不杀进程、不丢完成证据。
ROOT="$1"
test "$ROOT" = /data/local/tmp/aeii-hard-production-20261022-05 || exit 2
test -f "$ROOT/controller.lock/pid" || exit 2
PID=$(cat "$ROOT/controller.lock/pid")
TICKS=$(cat "$ROOT/controller.lock/starttime")
ticks() { sed 's/.*) //' "/proc/$1/stat" 2>/dev/null | awk '$1!="Z" && $1!="X" {print $20}'; }
test -n "$PID" && test -n "$TICKS" || exit 2
while test "$(ticks "$PID")" = "$TICKS"; do
    ATTEMPT=$(sed -n 's/.*"attempt"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$ROOT/STATE.json")
    case "$ATTEMPT" in hp1000-20261022-p05-????-r????) ;; *) sleep 1; continue ;; esac
    OUT="/data/user/0/net.toyknight.aeii.android/files/.aeii-hard-production/$ATTEMPT"
    if test -f "$OUT/artifact-manifest.json" && test -f "$OUT/THREAD_EXITED.json" && grep -q '"standalonePhase":"complete"' "$OUT/STATE.json"; then
        CURRENT=$(sed -n 's/.*"attempt"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$ROOT/STATE.json")
        if test "$CURRENT" = "$ATTEMPT"; then
            printf '%s\t%s\n' "$(date +%s)" "$ATTEMPT" > "$ROOT/DRAIN_REQUESTED.txt"
            : > "$ROOT/STOP"
            exit 0
        fi
    fi
    sleep 1
done
exit 0
