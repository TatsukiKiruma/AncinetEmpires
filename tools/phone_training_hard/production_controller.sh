#!/system/bin/sh
# 手机本地串行队列：普通启动应用后附加，每次尝试保留独立原始文件。
TASK_ROOT="$1"
PACKAGE=net.toyknight.aeii.android
TOTAL=1000
INITIAL_DONE=2
case "$TASK_ROOT" in /data/local/tmp/aeii-hard-production-*) ;; *) exit 2 ;; esac
TASK_SUFFIX=${TASK_ROOT#/data/local/tmp/aeii-hard-production-}
case "$TASK_SUFFIX" in ''|*[!A-Za-z0-9_-]*) exit 2 ;; esac
test -d "$TASK_ROOT" || exit 2
INDEX="$TASK_ROOT/index.txt"
BUNDLE="$TASK_ROOT/collector.bundle.js"
THAW="$TASK_ROOT/production_thaw.sh"
INJECT=/data/local/tmp/aeii-hard-inject-17.2.5
test ! -f "$TASK_ROOT/inject-path.txt" || INJECT=$(cat "$TASK_ROOT/inject-path.txt")
PREFIX=hp1000-20261022
test ! -f "$TASK_ROOT/attempt-prefix.txt" || PREFIX=$(cat "$TASK_ROOT/attempt-prefix.txt")
case "$PREFIX" in ''|*[!A-Za-z0-9_-]*) exit 2 ;; esac
test "${#PREFIX}" -le 50 || exit 2
for INPUT in "$INDEX" "$BUNDLE" "$INJECT" "$THAW"; do test -f "$INPUT" || exit 2; done
test -x "$INJECT" || exit 2
mkdir -p "$TASK_ROOT/config-run" "$TASK_ROOT/logs" "$TASK_ROOT/pending" "$TASK_ROOT/queue-history" "$TASK_ROOT/DONE_SEQS" || exit 2
LOCK="$TASK_ROOT/controller.lock"
START=$(date +%s)
SESSION="$START-$$"
LOG="$TASK_ROOT/logs/controller-$SESSION.log"
STATE="$TASK_ROOT/STATE.json"
STOP="$TASK_ROOT/STOP"
ACTIVE_SEQ=""; ATTEMPT=""; APP_PID=""; APP_START=""; CHILD=""; CHILD_START=""
DONE=$INITIAL_DONE; FAILED=0; ROUND=0; WHITELIST_ADDED=0
WAKE_NAME="aeii-hard-production-$SESSION"

log() { printf '%s\t%s\n' "$(date +%s)" "$*" >> "$LOG"; }
proc_start() { test -r "/proc/$1/stat" && sed 's/.*) //' "/proc/$1/stat" | awk '$1 != "Z" && $1 != "X" {print $20}'; }
write_state() {
    printf '{"schema":"hard-phone-production-controller-v1","phase":"%s","doneParents":%s,"remainingParents":%s,"total":%s,"failedAttempts":%s,"activeSeq":"%s","attempt":"%s","appPid":"%s","injectPid":"%s","controllerPid":%s,"round":%s,"updatedEpoch":%s,"computerRequired":false,"independentReplayDeferred":true}\n' \
        "$1" "$DONE" "$((TOTAL-DONE))" "$TOTAL" "$FAILED" "$ACTIVE_SEQ" "$ATTEMPT" "$APP_PID" "$CHILD" "$$" "$ROUND" "$(date +%s)" > "$STATE.tmp-$SESSION"
    mv "$STATE.tmp-$SESSION" "$STATE"
}
fatal() { log "输入或协议错误：$*"; cleanup_active; write_state fatal_input; exit 2; }

# 只终止本调度器记录了启动时钟的 PID；身份变化时保留新进程。
owned_matches() {
    PID="$1"; TICKS="$2"; KIND="$3"
    test -n "$PID" && test -n "$TICKS" || return 1
    test "$(proc_start "$PID")" = "$TICKS" || return 1
    # 启动时已经由包名或直接子进程确定身份，之后仅以启动时钟防止 PID 复用。
    # 不读取退出中的 /proc/PID/cmdline，部分 Android 内核会使该读取无限重复。
    if test "$KIND" = app; then
        test "$PID" = "$APP_PID" && test "$TICKS" = "$APP_START"
        return $?
    fi
    test "$KIND" = inject && test "$PID" = "$CHILD" && test "$TICKS" = "$CHILD_START"
}
stop_owned() {
    PID="$1"; TICKS="$2"; KIND="$3"
    test -n "$PID" || return 0
    if ! owned_matches "$PID" "$TICKS" "$KIND"; then
        log "不发送信号：$KIND pid=$PID 已退出或身份变化；当前start=$(proc_start "$PID")"
        return 0
    fi
    log "TERM 本次拥有进程：$KIND pid=$PID start=$TICKS"
    kill -TERM "$PID" 2>/dev/null
    WAIT=0
    while owned_matches "$PID" "$TICKS" "$KIND" && test "$WAIT" -lt 10; do sleep 1; WAIT=$((WAIT+1)); done
    if owned_matches "$PID" "$TICKS" "$KIND"; then
        log "有界等待后 KILL 本次拥有进程：$KIND pid=$PID start=$TICKS"
        kill -KILL "$PID" 2>/dev/null
        sleep 1
    fi
    owned_matches "$PID" "$TICKS" "$KIND" && return 1
    return 0
}
cleanup_active() {
    stop_owned "$CHILD" "$CHILD_START" inject || return 1
    stop_owned "$APP_PID" "$APP_START" app || return 1
    CHILD=""; CHILD_START=""; APP_PID=""; APP_START=""
    return 0
}
release() {
    if test -w /sys/power/wake_unlock; then printf '%s' "$WAKE_NAME" > /sys/power/wake_unlock 2>/dev/null; fi
    if test "$WHITELIST_ADDED" = 1; then dumpsys deviceidle whitelist -"$PACKAGE" >> "$LOG" 2>&1; fi
    if test -f "$LOCK/pid" && test "$(cat "$LOCK/pid")" = "$$"; then
        mv "$LOCK" "$TASK_ROOT/queue-history/controller-lock-$SESSION" 2>/dev/null
    fi
}
interrupted() { log '调度器收到退出信号'; cleanup_active; write_state stopped; exit 130; }

# 同一任务只运行一个调度器，过期锁保留为历史记录。
if ! mkdir "$LOCK" 2>/dev/null; then
    OLD_PID=$(cat "$LOCK/pid" 2>/dev/null)
    OLD_START=$(cat "$LOCK/starttime" 2>/dev/null)
    test -n "$OLD_PID" && test -n "$OLD_START" && test "$(proc_start "$OLD_PID")" = "$OLD_START" && exit 3
    mv "$LOCK" "$TASK_ROOT/queue-history/stale-lock-$SESSION" || exit 3
    mkdir "$LOCK" || exit 3
fi
printf '%s\n' "$$" > "$LOCK/pid"
proc_start "$$" > "$LOCK/starttime"
trap release EXIT
trap interrupted INT TERM
if test -w /sys/power/wake_lock; then printf '%s' "$WAKE_NAME" > /sys/power/wake_lock; fi
if ! dumpsys deviceidle whitelist | grep -F ",$PACKAGE," >/dev/null; then
    if dumpsys deviceidle whitelist +"$PACKAGE" >> "$LOG" 2>&1; then WHITELIST_ADDED=1; fi
fi

# 不用序号推算完成数量，只读取本任务真正成功的标记。
COUNT=0
while read -r SEQ PARENT TEMPLATE EXTRA; do
    test -n "$SEQ" || continue
    case "$SEQ" in *[!0-9]*) fatal "非法序号 $SEQ" ;; esac
    test "$SEQ" -ge 3 && test "$SEQ" -le 1000 && test -n "$PARENT" && test -f "$TEMPLATE" && test -z "$EXTRA" || fatal "队列格式或模板缺失 $SEQ"
    grep -F '__ATTEMPT__' "$TEMPLATE" >/dev/null || fatal "模板没有 __ATTEMPT__：$TEMPLATE"
    COUNT=$((COUNT+1))
    test ! -f "$TASK_ROOT/DONE_SEQS/$SEQ" || DONE=$((DONE+1))
done < "$INDEX"
test "$COUNT" = 998 || fatal "需要998个待采父局，实际$COUNT"
test "$(awk '{print $1}' "$INDEX" | sort -u | wc -l | tr -d ' ')" = 998 || fatal '队列序号重复'
test "$(awk '{print $2}' "$INDEX" | sort -u | wc -l | tr -d ' ')" = 998 || fatal '队列父局重复'
test ! -f "$TASK_ROOT/failure.tsv" || FAILED=$(wc -l < "$TASK_ROOT/failure.tsv" | tr -d ' ')
write_state starting

while test "$DONE" -lt "$TOTAL"; do
    test ! -e "$STOP" || { write_state stopped; exit 0; }
    ROUND=$((ROUND+1))
    QUEUE="$TASK_ROOT/pending/round-$SESSION-$ROUND.tsv"
    NEXT="$TASK_ROOT/pending/retry-$SESSION-$ROUND.tsv"
    cp "$INDEX" "$QUEUE" || fatal '无法保存本轮队列'
    : > "$NEXT"
    while read -r SEQ PARENT TEMPLATE EXTRA; do
        test -n "$SEQ" || continue
        test ! -f "$TASK_ROOT/DONE_SEQS/$SEQ" || continue
        test ! -e "$STOP" || { write_state stopped; exit 0; }
        ACTIVE_SEQ="$SEQ"; ATTEMPT=""; APP_PID=""; APP_START=""; CHILD=""; CHILD_START=""
        # 未知应用进程不能被重启或杀死；等待它退出后再启动新局。
        while test -n "$(pidof "$PACKAGE")"; do
            log "等待未知应用进程：$(pidof "$PACKAGE")"
            write_state waiting_device
            test ! -e "$STOP" || { write_state stopped; exit 0; }
            sleep 30
        done
        SEQ4=$(printf '%04d' "$SEQ")
        TRY=1
        while :; do
            ATTEMPT=$(printf '%s-%s-r%04d' "$PREFIX" "$SEQ4" "$TRY")
            CONFIG="$TASK_ROOT/config-run/$ATTEMPT.json"
            OUT="/data/user/0/$PACKAGE/files/.aeii-hard-production/$ATTEMPT"
            test ! -e "$CONFIG" && test ! -e "$OUT" && break
            TRY=$((TRY+1))
        done
        test "${#ATTEMPT}" -le 79 || fatal '尝试编号过长'
        sed "s/__ATTEMPT__/$ATTEMPT/g" "$TEMPLATE" > "$CONFIG" || fatal "无法生成配置 $ATTEMPT"
        RUN_LOG="$TASK_ROOT/logs/$ATTEMPT.log"
        WHY=""; PHASE=""; START_JOB=$(date +%s); LAST_PROGRESS=$START_JOB; LAST_ACTIONS=""; STOP_SINCE=0; COMPLETE_SINCE=0
        write_state starting_app
        # 小米锁屏时会冻结新启动进程，先唤醒屏幕让原生应用完成初始化。
        input keyevent 224 >> "$RUN_LOG" 2>&1
        am start -n "$PACKAGE/.AndroidLauncher" >> "$RUN_LOG" 2>&1
        WAIT=0
        while test -z "$(pidof "$PACKAGE")" && test "$WAIT" -lt 20; do sleep 1; WAIT=$((WAIT+1)); done
        PIDS=$(pidof "$PACKAGE")
        set -- $PIDS
        if test "$#" != 1; then
            WHY=app_start_not_single
            log "启动后没有唯一应用PID，保留未知进程：$PIDS"
        else
            APP_PID="$1"; APP_START=$(proc_start "$APP_PID")
            if ! owned_matches "$APP_PID" "$APP_START" app; then
                WHY=app_identity_unconfirmed; APP_PID=""; APP_START=""
            else
                printf '%s\t%s\t%s\t%s\t%s\n' "$ATTEMPT" "$APP_PID" "$APP_START" "$(date +%s)" "$PACKAGE" >> "$TASK_ROOT/owned-processes.tsv"
                sh "$THAW" "$TASK_ROOT" "$APP_PID" "$APP_START" >> "$LOG" 2>&1
                PARAMS=$(cat "$CONFIG") || fatal '无法读取已生成配置'
                "$INJECT" -p "$APP_PID" -s "$BUNDLE" -P "$PARAMS" > "$RUN_LOG.inject" 2>&1 < /dev/null &
                CHILD=$!; CHILD_START=$(proc_start "$CHILD")
                # 仅检查直接子进程的启动时钟，允许 exec 替换前的短暂 shell 阶段。
                WAIT=0
                while ! owned_matches "$CHILD" "$CHILD_START" inject && test "$WAIT" -lt 3; do sleep 1; WAIT=$((WAIT+1)); done
                printf '%s\t%s\t%s\t%s\n' "$ATTEMPT" "$CHILD" "$CHILD_START" "$(date +%s)" >> "$TASK_ROOT/owned-injects.tsv"
            fi
        fi
        while test -z "$WHY"; do
            # 仅按本次主进程身份和实际服务绑定解除小米冻结，不改全局省电设置。
            sh "$THAW" "$TASK_ROOT" "$APP_PID" "$APP_START" >> "$LOG" 2>&1
            NOW=$(date +%s)
            JOB_STATE="$OUT/STATE.json"
            PHASE=""; ACTIONS=""
            if test -f "$JOB_STATE"; then
                PHASE=$(sed -n 's/.*"standalonePhase"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$JOB_STATE")
                ACTIONS=$(sed -n 's/.*"actions"[[:space:]]*:[[:space:]]*\([0-9][0-9]*\).*/\1/p' "$JOB_STATE")
                test -n "$ACTIONS" || ACTIONS=$(sed -n 's/.*"committedActions"[[:space:]]*:[[:space:]]*\([0-9][0-9]*\).*/\1/p' "$JOB_STATE")
            fi
            case "$PHASE" in
                complete)
                    if test -f "$OUT/artifact-manifest.json" && test -f "$OUT/THREAD_EXITED.json"; then WHY=complete; break; fi
                    test "$COMPLETE_SINCE" != 0 || COMPLETE_SINCE=$NOW
                    if test "$((NOW-COMPLETE_SINCE))" -gt 10; then WHY=complete_without_thread_exit; break; fi ;;
                failed|truncated|stopped) WHY="$PHASE"; break ;;
            esac
            if ! owned_matches "$APP_PID" "$APP_START" app; then WHY=app_disappeared; break; fi
            if ! owned_matches "$CHILD" "$CHILD_START" inject; then WHY=inject_disappeared; break; fi
            if test -z "$PHASE" && test "$((NOW-START_JOB))" -gt 90; then WHY=no_state_90s; break; fi
            if test "$PHASE" = waiting_resources; then LAST_PROGRESS=$NOW
            elif test "$ACTIONS" != "$LAST_ACTIONS"; then LAST_ACTIONS="$ACTIONS"; LAST_PROGRESS=$NOW
            elif test "$((NOW-LAST_PROGRESS))" -gt 600; then WHY=no_action_progress_600s; break
            fi
            if test -e "$STOP"; then
                test "$STOP_SINCE" != 0 || STOP_SINCE=$NOW
                write_state stopping
                if test "$((NOW-STOP_SINCE))" -gt 30; then WHY=stopped; break; fi
            elif test "$PHASE" = complete; then write_state waiting_thread_exit
            else write_state "$PHASE"; fi
            sleep 3
        done
        log "尝试结束：seq=$SEQ attempt=$ATTEMPT phase=$PHASE reason=$WHY"
        # 先关闭本次注入器，再按PID和启动时钟精确退出本局应用。
        if ! cleanup_active; then
            log '本次拥有进程未退出，等待后重查，禁止另起并发局'
            while ! cleanup_active; do write_state waiting_device; sleep 30; done
        fi
        if test "$WHY" = complete; then
            # 文件标记只在自然终局、摘要落盘且拥有进程退出后创建。
            if (set -C; printf '%s\t%s\t%s\n' "$PARENT" "$ATTEMPT" "$(date +%s)" > "$TASK_ROOT/DONE_SEQS/$SEQ") 2>/dev/null; then DONE=$((DONE+1)); fi
            printf '%s\t%s\t%s\t%s\n' "$SEQ" "$PARENT" "$ATTEMPT" "$(date +%s)" >> "$TASK_ROOT/completed.tsv"
        else
            FAILED=$((FAILED+1))
            printf '%s\t%s\t%s\t%s\t%s\n' "$SEQ" "$PARENT" "$ATTEMPT" "$WHY" "$(date +%s)" >> "$TASK_ROOT/failure.tsv"
            printf '%s\t%s\t%s\n' "$SEQ" "$PARENT" "$TEMPLATE" >> "$NEXT"
        fi
        write_state between_games
        test ! -e "$STOP" || { write_state stopped; exit 0; }
    done < "$QUEUE"
    mv "$QUEUE" "$TASK_ROOT/queue-history/round-$SESSION-$ROUND.tsv"
    mv "$NEXT" "$TASK_ROOT/queue-history/retry-$SESSION-$ROUND.tsv"
    ACTIVE_SEQ=""; ATTEMPT=""
    # 每轮均先给其他父局机会；第三轮及之后对仍失败的局统一退避。
    if test "$DONE" -lt "$TOTAL" && test "$ROUND" -ge 3; then write_state retry_backoff; sleep 60; fi
done
ACTIVE_SEQ=""; ATTEMPT=""; write_state complete
log '全部1000个父局已自然结束，原始证据留在手机'
