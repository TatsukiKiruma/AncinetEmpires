#!/system/bin/sh
# 手机本地串行调度；脚本、启动器和所有输入都已经保存在手机。
TASK_ROOT="$1"
INJECT=/data/local/tmp/aeii-hard-inject-17.2.5
PACKAGE=net.toyknight.aeii.android
STATE="$TASK_ROOT/STATE.json"
STOP="$TASK_ROOT/STOP"
DONE=2
ACTIVE=""
CHILD=""
write_state() {
    printf '{"schema":"hard-phone-standalone-controller-v1","phase":"%s","doneParents":%s,"total":1000,"activeAttempt":"%s","controllerPid":%s,"injectPid":"%s","deviceEpoch":%s,"computerRequired":false}\n' "$1" "$DONE" "$ACTIVE" "$$" "$CHILD" "$(date +%s)" > "$STATE.tmp"
    mv "$STATE.tmp" "$STATE"
}
fail() {
    printf '%s\n' "$1" >> "$TASK_ROOT/controller-errors.log"
    write_state stopped_on_failure
    exit 1
}
test -d "$TASK_ROOT" || exit 2
# 原子创建锁目录，禁止两个调度器消费相同队列。
mkdir "$TASK_ROOT/controller.lock" 2>/dev/null || exit 3
printf '%s\n' "$$" > "$TASK_ROOT/controller.lock/pid"
WAKE_NAME=aeii-hard1000-20261022-01
if test -w /sys/power/wake_lock; then
    printf '%s' "$WAKE_NAME" > /sys/power/wake_lock
fi
trap 'printf "%s" "$WAKE_NAME" > /sys/power/wake_unlock 2>/dev/null' EXIT
trap 'write_state interrupted; exit 130' INT TERM
write_state starting
while read -r ACTIVE BEFORE CONFIG JOB_STATE; do
    test -n "$ACTIVE" || continue
    DONE="$BEFORE"
    test ! -e "$STOP" || { write_state stopped_by_user; exit 0; }
    EXISTING=$(pidof "$PACKAGE")
    test -z "$EXISTING" || fail "启动前已有应用进程，保留进程并停止：$EXISTING"
    PARAMS=$(cat "$CONFIG") || fail "读取本机配置失败：$CONFIG"
    "$INJECT" -f "$PACKAGE" -s "$TASK_ROOT/collector.bundle.js" -P "$PARAMS" > "$TASK_ROOT/logs/$ACTIVE.log" 2>&1 < /dev/null &
    CHILD=$!
    START_EPOCH=$(date +%s)
    printf '%s\n' "$CHILD" > "$TASK_ROOT/active-inject.pid"
    write_state collecting
    while :; do
        PHASE=""
        if test -f "$JOB_STATE"; then
            PHASE=$(sed -n 's/.*"standalonePhase":"\([^"]*\)".*/\1/p' "$JOB_STATE")
        fi
        if test "$PHASE" = complete; then
            # complete只在原生线程退出、UI收尾及七件摘要落盘后写出。
            kill -TERM "$CHILD" 2>/dev/null
            wait "$CHILD" 2>/dev/null
            CHILD=""
            REMAINING=$(pidof "$PACKAGE")
            if test -n "$REMAINING"; then
                # 此应用是本调度器在确认无进程后独占启动的本局进程。
                am force-stop "$PACKAGE" >/dev/null 2>&1
            fi
            test -z "$(pidof "$PACKAGE")" || fail "本局安全结束后应用仍未退出"
            DONE=$((BEFORE + 1))
            printf '%s\t%s\t%s\n' "$ACTIVE" "$DONE" "$(date +%s)" >> "$TASK_ROOT/completed.tsv"
            write_state between_games
            break
        fi
        if test "$PHASE" = failed || test "$PHASE" = stopped; then
            # 失败进程、原始数据和本地注入会话保留，避免强行卸载在途钩子。
            fail "手机单局停止，详情：$JOB_STATE"
        fi
        kill -0 "$CHILD" 2>/dev/null || fail "手机本地启动器异常退出，详情：$TASK_ROOT/logs/$ACTIVE.log"
        if test -z "$PHASE" && test $(($(date +%s) - START_EPOCH)) -gt 120; then
            fail "启动后120秒没有手机单局状态，保留现场：$ACTIVE"
        fi
        if test -e "$STOP"; then
            # 单局驱动同时检查任务根的STOP，并等待在途动作结束。
            write_state stopping
        else
            write_state collecting
        fi
        sleep 3
    done
done < "$TASK_ROOT/index.txt"
ACTIVE=""
write_state complete
