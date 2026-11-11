#!/system/bin/sh
# 每个应用进程运行一份静态分片；总调度器负责跨worker聚合与CPU暂停。
TASK_ROOT="$1"
safe_root() {
    case "$1" in
        /data/local/tmp/aeii-hard-production-parallel-*) ROOT_SUFFIX=${1#/data/local/tmp/aeii-hard-production-parallel-} ;;
        /data/local/tmp/aeii-hard-production-concurrency-*) ROOT_SUFFIX=${1#/data/local/tmp/aeii-hard-production-concurrency-} ;;
        /data/local/tmp/aeii-hard-concurrency-*) ROOT_SUFFIX=${1#/data/local/tmp/aeii-hard-concurrency-} ;;
        *) return 1 ;;
    esac
    case "$ROOT_SUFFIX" in ''|*[!A-Za-z0-9_-]*) return 1 ;; esac
    return 0
}
safe_root "$TASK_ROOT" && test -d "$TASK_ROOT" && test -f "$TASK_ROOT/worker.env" || exit 2
PACKAGE=""; APP_UID=""; ACTIVITY=""; GLOBAL_ROOT=""; WORKER_ID=""; TOTAL=""; INITIAL_DONE=0
ENV_SEEN="|"
# 配置只接受明确字段和值，不执行env中的任意shell内容。
while IFS='=' read -r ENV_KEY ENV_VALUE || test -n "$ENV_KEY"; do
    case "$ENV_KEY" in ''|\#*) continue ;; esac
    case "$ENV_KEY" in PACKAGE|APP_UID|ACTIVITY|GLOBAL_ROOT|WORKER_ID|TOTAL|INITIAL_DONE) ;; *) exit 2 ;; esac
    case "$ENV_SEEN" in *"|$ENV_KEY|"*) exit 2 ;; esac
    ENV_SEEN="$ENV_SEEN$ENV_KEY|"
    ENV_VALUE=$(printf '%s' "$ENV_VALUE" | tr -d '\r')
    case "$ENV_VALUE" in \'*\') ENV_VALUE=${ENV_VALUE#\'}; ENV_VALUE=${ENV_VALUE%\'} ;; \"*\") ENV_VALUE=${ENV_VALUE#\"}; ENV_VALUE=${ENV_VALUE%\"} ;; esac
    case "$ENV_KEY" in
        PACKAGE) PACKAGE="$ENV_VALUE" ;; APP_UID) APP_UID="$ENV_VALUE" ;; ACTIVITY) ACTIVITY="$ENV_VALUE" ;;
        GLOBAL_ROOT) GLOBAL_ROOT="$ENV_VALUE" ;; WORKER_ID) WORKER_ID="$ENV_VALUE" ;; TOTAL) TOTAL="$ENV_VALUE" ;;
        INITIAL_DONE) test "$ENV_VALUE" = 0 || exit 2 ;;
    esac
done < "$TASK_ROOT/worker.env"
case "$PACKAGE:$ACTIVITY" in *[!A-Za-z0-9_.:]*|:*|*:) exit 2 ;; esac
case "$WORKER_ID" in ''|*[!A-Za-z0-9_-]*) exit 2 ;; esac
case "$APP_UID:$TOTAL" in *[!0-9:]*|:*|*:) exit 2 ;; esac
case "$APP_UID:$TOTAL" in 0*|*:0*) exit 2 ;; esac
test "$APP_UID" -ge 10000 && test "$APP_UID" -lt 20000 && test "$TOTAL" -ge 1 && test "$TOTAL" -le 998 || exit 2
safe_root "$GLOBAL_ROOT" && test -d "$GLOBAL_ROOT" || exit 2
INDEX="$TASK_ROOT/index.txt"
BUNDLE="$TASK_ROOT/collector.bundle.js"
THAW="$TASK_ROOT/process_thaw.sh"
INJECT=/data/local/tmp/aeii-hard-inject-17.2.5
test ! -f "$TASK_ROOT/inject-path.txt" || INJECT=$(cat "$TASK_ROOT/inject-path.txt")
PREFIX="hp1000-20261022-$WORKER_ID"
test ! -f "$TASK_ROOT/attempt-prefix.txt" || PREFIX=$(cat "$TASK_ROOT/attempt-prefix.txt")
case "$PREFIX" in ''|*[!A-Za-z0-9_-]*) exit 2 ;; esac
test "${#PREFIX}" -le 50 || exit 2
for INPUT in "$INDEX" "$BUNDLE" "$INJECT" "$THAW"; do test -f "$INPUT" || exit 2; done
test -x "$INJECT" || exit 2
mkdir -p "$TASK_ROOT/config-run" "$TASK_ROOT/logs" "$TASK_ROOT/pending" "$TASK_ROOT/queue-history" "$TASK_ROOT/DONE_SEQS" || exit 2
mkdir -p "$TASK_ROOT/FINAL_SEQS" "$TASK_ROOT/STARTED_ATTEMPTS" || exit 2
. "$TASK_ROOT/queue_policy.sh"
mkdir -p "$GLOBAL_ROOT/history" || exit 2
LOCK="$TASK_ROOT/controller.lock"
START=$(date +%s)
SESSION="$START-$$"
LOG="$TASK_ROOT/logs/controller-$SESSION.log"
STATE="$TASK_ROOT/STATE.json"
STOP="$TASK_ROOT/STOP"
PAUSE="$GLOBAL_ROOT/PAUSE-$WORKER_ID"
ACTIVE_SEQ=""; ATTEMPT=""; APP_PID=""; APP_START=""; CHILD=""; CHILD_START=""
IMPORTANCE_PID=""; IMPORTANCE_START=""
IMPORTANCE_JAR="$GLOBAL_ROOT/process-importance.jar"
test -f "$IMPORTANCE_JAR" || exit 2
DONE=$INITIAL_DONE; TERMINAL=0; FAILED=0; ROUND=0; WHITELIST_ADDED=0
WAKE_NAME="aeii-hard-$WORKER_ID-$SESSION"
START_LOCK="$GLOBAL_ROOT/app-start.lock"
START_LOCK_HELD=0; START_LOCK_RELEASES=0; CONTROLLER_START=""

log() { printf '%s\t%s\n' "$(date +%s)" "$*" >> "$LOG"; }
proc_start() { test -r "/proc/$1/stat" && sed 's/.*) //' "/proc/$1/stat" | awk '$1 != "Z" && $1 != "X" {print $20}'; }
live_app_pids() {
    # pidof可能短暂包含退出中的旧进程；只接受本包UID且仍存活的主进程。
    for CANDIDATE_PID in $(pidof "$PACKAGE"); do
        test "$(awk '/^Uid:/{print $2;exit}' /proc/"$CANDIDATE_PID"/status 2>/dev/null)" = "$APP_UID" || continue
        test -n "$(proc_start "$CANDIDATE_PID")" && printf '%s\n' "$CANDIDATE_PID"
    done
}
write_state() {
    printf '{"schema":"hard-phone-process-controller-v1","phase":"%s","package":"%s","workerId":"%s","doneParents":%s,"remainingParents":%s,"total":%s,"failedAttempts":%s,"activeSeq":"%s","attempt":"%s","appPid":"%s","injectPid":"%s","controllerPid":%s,"round":%s,"updatedEpoch":%s,"computerRequired":false,"terminalParents":%s,"replay":"disabled_by_user"}\n' \
        "$1" "$PACKAGE" "$WORKER_ID" "$DONE" "$((TOTAL-DONE))" "$TOTAL" "$FAILED" "$ACTIVE_SEQ" "$ATTEMPT" "$APP_PID" "$CHILD" "$$" "$ROUND" "$(date +%s)" "$TERMINAL" > "$STATE.tmp-$SESSION"
    mv "$STATE.tmp-$SESSION" "$STATE"
}
sync_stop() {
    if test -e "$GLOBAL_ROOT/STOP" && test ! -e "$STOP"; then
        (set -C; printf 'global_stop\n' > "$STOP") 2>/dev/null || test -e "$STOP"
    fi
    test -e "$STOP"
}
drain_before_start() {
    if test -e "$TASK_ROOT/DRAIN" || test -e "$GLOBAL_ROOT/DRAIN"; then
        write_state drained
        log '收到排空标记，保留在途结果后退出，不启动下一局'
        exit 0
    fi
}
wait_unpaused() {
    sync_stop && return 1
    test ! -e "$GLOBAL_ROOT/CONSTRUCTION_BLOCK" || return 1
    drain_before_start
    while test -e "$PAUSE"; do
        write_state paused
        sync_stop && return 1
        drain_before_start
        sleep 3
    done
    sync_stop && return 1
    test ! -e "$GLOBAL_ROOT/CONSTRUCTION_BLOCK" || return 1
    drain_before_start
    return 0
}
release_start_lock() {
    test "$START_LOCK_HELD" = 1 || return 0
    SL_OWNER_PID=""; SL_OWNER_TICKS=""; SL_OWNER_SESSION=""
    read -r SL_OWNER_PID SL_OWNER_TICKS SL_OWNER_SESSION 2>/dev/null < "$START_LOCK/owner.tsv"
    if test "$SL_OWNER_PID" = "$$" && test "$SL_OWNER_TICKS" = "$CONTROLLER_START" && test "$SL_OWNER_SESSION" = "$SESSION"; then
        START_LOCK_RELEASES=$((START_LOCK_RELEASES+1))
        SL_ARCHIVE="$GLOBAL_ROOT/history/app-start-release-$SESSION-$START_LOCK_RELEASES"
        mv "$START_LOCK" "$SL_ARCHIVE" || return 1
    else
        log '启动锁已不属于本控制器，保留当前锁'
    fi
    START_LOCK_HELD=0
    return 0
}
acquire_start_lock() {
    while :; do
        wait_unpaused || return 1
        if mkdir "$START_LOCK" 2>/dev/null; then
            START_LOCK_HELD=1
            printf '%s\t%s\t%s\n' "$$" "$CONTROLLER_START" "$SESSION" > "$START_LOCK/owner.tsv" || return 1
            return 0
        fi
        write_state waiting_start_lock
        SL_OWNER_PID=""; SL_OWNER_TICKS=""; SL_OWNER_SESSION=""
        read -r SL_OWNER_PID SL_OWNER_TICKS SL_OWNER_SESSION 2>/dev/null < "$START_LOCK/owner.tsv"
        SL_STALE=0
        case "$SL_OWNER_PID:$SL_OWNER_TICKS" in
            *[!0-9:]*|:*|*:)
                # mkdir与写owner之间留有短暂窗口，避免误归档刚建立的锁。
                SL_MTIME=$(stat -c %Y "$START_LOCK" 2>/dev/null)
                case "$SL_MTIME" in ''|*[!0-9]*) ;; *) test "$(( $(date +%s)-SL_MTIME ))" -gt 10 && SL_STALE=1 ;; esac ;;
            *) test "$(proc_start "$SL_OWNER_PID")" = "$SL_OWNER_TICKS" || SL_STALE=1 ;;
        esac
        if test "$SL_STALE" = 1 && test -d "$START_LOCK/reclaim.lock"; then
            SL_RECLAIM_PID=""; SL_RECLAIM_TICKS=""
            read -r SL_RECLAIM_PID SL_RECLAIM_TICKS 2>/dev/null < "$START_LOCK/reclaim.lock/owner.tsv"
            SL_RECLAIM_STALE=0
            case "$SL_RECLAIM_PID:$SL_RECLAIM_TICKS" in
                *[!0-9:]*|:*|*:)
                    SL_MTIME=$(stat -c %Y "$START_LOCK/reclaim.lock" 2>/dev/null)
                    case "$SL_MTIME" in ''|*[!0-9]*) ;; *) test "$(( $(date +%s)-SL_MTIME ))" -gt 10 && SL_RECLAIM_STALE=1 ;; esac ;;
                *) test "$(proc_start "$SL_RECLAIM_PID")" = "$SL_RECLAIM_TICKS" || SL_RECLAIM_STALE=1 ;;
            esac
            test "$SL_RECLAIM_STALE" != 1 || mv "$START_LOCK/reclaim.lock" "$GLOBAL_ROOT/history/app-start-reclaim-stale-$SESSION-$(date +%s)" 2>/dev/null
        fi
        if test "$SL_STALE" = 1 && mkdir "$START_LOCK/reclaim.lock" 2>/dev/null; then
            printf '%s\t%s\n' "$$" "$CONTROLLER_START" > "$START_LOCK/reclaim.lock/owner.tsv"
            # 同一个旧锁只允许一个等待者归档；移动前再次核对owner，避免污染新归属。
            SL_CHECK_PID=""; SL_CHECK_TICKS=""; SL_CHECK_SESSION=""
            read -r SL_CHECK_PID SL_CHECK_TICKS SL_CHECK_SESSION 2>/dev/null < "$START_LOCK/owner.tsv"
            if test "$SL_CHECK_PID:$SL_CHECK_TICKS:$SL_CHECK_SESSION" = "$SL_OWNER_PID:$SL_OWNER_TICKS:$SL_OWNER_SESSION" && { test -z "$SL_CHECK_PID" || test "$(proc_start "$SL_CHECK_PID")" != "$SL_CHECK_TICKS"; }; then
                SL_ARCHIVE="$GLOBAL_ROOT/history/app-start-stale-$SESSION-$(date +%s)"
                mv "$START_LOCK" "$SL_ARCHIVE" && log "归档失效启动锁：owner=$SL_OWNER_PID ticks=$SL_OWNER_TICKS"
            else
                mv "$START_LOCK/reclaim.lock" "$GLOBAL_ROOT/history/app-start-reclaim-cancel-$SESSION-$(date +%s)" 2>/dev/null
            fi
        fi
        sync_stop && return 1
        drain_before_start
        sleep 3
    done
}
fatal() { log "输入或协议错误：$*"; cleanup_active; write_state fatal_input; exit 2; }

# 进程归属只用启动时记录的PID与启动时钟，避免退出竞态中的cmdline读取。
owned_matches() {
    PID="$1"; TICKS="$2"; KIND="$3"
    test -n "$PID" && test -n "$TICKS" || return 1
    test "$(proc_start "$PID")" = "$TICKS" || return 1
    if test "$KIND" = app; then
        test "$PID" = "$APP_PID" && test "$TICKS" = "$APP_START"
        return $?
    fi
    if test "$KIND" = importance; then
        test "$PID" = "$IMPORTANCE_PID" && test "$TICKS" = "$IMPORTANCE_START"
        return $?
    fi
    test "$KIND" = inject && test "$PID" = "$CHILD" && test "$TICKS" = "$CHILD_START"
}
stop_owned() {
    PID="$1"; TICKS="$2"; KIND="$3"
    test -n "$PID" || return 0
    if ! owned_matches "$PID" "$TICKS" "$KIND"; then log "不发送信号：$KIND pid=$PID 已退出或身份变化"; return 0; fi
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
    release_start_lock || return 1
    stop_owned "$CHILD" "$CHILD_START" inject || return 1
    # 结束本次拥有的Activity任务，防止直接杀进程后Android自动重建界面并占住下一局。
    if owned_matches "$APP_PID" "$APP_START" app; then
        log "结束本次采集应用任务：$PACKAGE pid=$APP_PID start=$APP_START"
        timeout 8 am force-stop "$PACKAGE" >> "$LOG" 2>&1
    fi
    stop_owned "$APP_PID" "$APP_START" app || return 1
    # Binder令牌随辅助进程退出自动解除；仅回收本次启动且时钟一致的辅助进程。
    stop_owned "$IMPORTANCE_PID" "$IMPORTANCE_START" importance || return 1
    CHILD=""; CHILD_START=""; APP_PID=""; APP_START=""
    IMPORTANCE_PID=""; IMPORTANCE_START=""
    return 0
}
release() {
    release_start_lock
    if test -w /sys/power/wake_unlock; then printf '%s' "$WAKE_NAME" > /sys/power/wake_unlock 2>/dev/null; fi
    if test "$WHITELIST_ADDED" = 1; then dumpsys deviceidle whitelist -"$PACKAGE" >> "$LOG" 2>&1; fi
    if test -f "$LOCK/pid" && test "$(cat "$LOCK/pid")" = "$$"; then mv "$LOCK" "$TASK_ROOT/queue-history/controller-lock-$SESSION" 2>/dev/null; fi
}
interrupted() {
    log '调度器收到退出信号'
    test -e "$STOP" || (set -C; printf 'controller_signal\n' > "$STOP") 2>/dev/null
    cleanup_active; write_state stopped; exit 130
}

if ! mkdir "$LOCK" 2>/dev/null; then
    OLD_PID=$(cat "$LOCK/pid" 2>/dev/null)
    OLD_START=$(cat "$LOCK/starttime" 2>/dev/null)
    test -n "$OLD_PID" && test -n "$OLD_START" && test "$(proc_start "$OLD_PID")" = "$OLD_START" && exit 3
    mv "$LOCK" "$TASK_ROOT/queue-history/stale-lock-$SESSION" || exit 3
    mkdir "$LOCK" || exit 3
fi
printf '%s\n' "$$" > "$LOCK/pid"
CONTROLLER_START=$(proc_start "$$")
test -n "$CONTROLLER_START" || exit 2
printf '%s\n' "$CONTROLLER_START" > "$LOCK/starttime"
trap release EXIT
trap interrupted INT TERM
if test -w /sys/power/wake_lock; then printf '%s' "$WAKE_NAME" > /sys/power/wake_lock; fi
if ! dumpsys deviceidle whitelist | grep -F ",$PACKAGE," >/dev/null; then
    if dumpsys deviceidle whitelist +"$PACKAGE" >> "$LOG" 2>&1; then WHITELIST_ADDED=1; fi
fi

# 原parent序号不重排；同一分片内序号、父局、模板均不得重复。
COUNT=0
while read -r SEQ PARENT TEMPLATE EXTRA; do
    test -n "$SEQ" || continue
    case "$SEQ" in *[!0-9]*|0*) fatal "非法序号 $SEQ" ;; esac
    test "$SEQ" -ge 1 && test "$SEQ" -le 1000 && test -n "$PARENT" && test -f "$TEMPLATE" && test -z "$EXTRA" || fatal "队列格式或模板缺失 $SEQ"
    case "$TEMPLATE" in "$TASK_ROOT"/configs/*.json) ;; *) fatal "模板不属于本worker：$TEMPLATE" ;; esac
    grep -F '__ATTEMPT__' "$TEMPLATE" >/dev/null || fatal "模板没有 __ATTEMPT__：$TEMPLATE"
    COUNT=$((COUNT+1))
    test ! -f "$TASK_ROOT/DONE_SEQS/$SEQ" || DONE=$((DONE+1))
    test ! -f "$TASK_ROOT/FINAL_SEQS/$SEQ" || TERMINAL=$((TERMINAL+1))
done < "$INDEX"
test "$COUNT" = "$TOTAL" || fatal "需要$TOTAL个分片父局，实际$COUNT"
for COLUMN in 1 2 3; do
    test "$(awk -v column="$COLUMN" 'NF {print $column}' "$INDEX" | sort -u | wc -l | tr -d ' ')" = "$TOTAL" || fatal "队列第$COLUMN列重复"
done
test ! -f "$TASK_ROOT/failure.tsv" || FAILED=$(wc -l < "$TASK_ROOT/failure.tsv" | tr -d ' ')
write_state starting

while test "$((DONE+TERMINAL))" -lt "$TOTAL"; do
    wait_unpaused || { write_state stopped; exit 0; }
    ROUND=$((ROUND+1))
    QUEUE="$TASK_ROOT/pending/round-$SESSION-$ROUND.tsv"
    NEXT="$TASK_ROOT/pending/retry-$SESSION-$ROUND.tsv"
    cp "$INDEX" "$QUEUE" || fatal '无法保存本轮队列'
    : > "$NEXT"
    while read -r SEQ PARENT TEMPLATE EXTRA; do
        test -n "$SEQ" || continue
        test ! -f "$TASK_ROOT/DONE_SEQS/$SEQ" || continue
        test ! -f "$TASK_ROOT/FINAL_SEQS/$SEQ" || continue
        if test "$SEQ" -gt 42; then
            observation_ready; OBS_READY=$?
            if test "$OBS_READY" = 2; then write_state observation_failed; exit 1; fi
            test "$OBS_READY" = 0 || continue
            if blocked_cell "$TEMPLATE"; then
                printf '%s\t%s\n' "$PARENT" observation_cell_without_natural_end > "$TASK_ROOT/FINAL_SEQS/$SEQ"
                TERMINAL=$((TERMINAL+1)); continue
            fi
        fi
        wait_unpaused || { write_state stopped; exit 0; }
        ACTIVE_SEQ="$SEQ"; ATTEMPT=""; APP_PID=""; APP_START=""; CHILD=""; CHILD_START=""; IMPORTANCE_PID=""; IMPORTANCE_START=""
        while test -n "$(live_app_pids)"; do
            log "等待未知应用进程：$(live_app_pids)"; write_state waiting_device
            sync_stop && { write_state stopped; exit 0; }
            drain_before_start
            sleep 3
        done
        wait_unpaused || { write_state stopped; exit 0; }
        SEQ4=$(printf '%04d' "$SEQ")
        TRY=1
        while :; do
            ATTEMPT=$(printf '%s-%s-r%04d' "$PREFIX" "$SEQ4" "$TRY")
            CONFIG="$TASK_ROOT/config-run/$ATTEMPT.json"
            OUT="/data/user/0/$PACKAGE/files/.aeii-hard-production/$ATTEMPT"
            test ! -e "$CONFIG" && test ! -e "$OUT" && break
            TRY=$((TRY+1))
        done
        # 预留文件不代表已启动；实际启动账本在am start之前原子写入。
        STARTED_COUNT=$(find "$TASK_ROOT/STARTED_ATTEMPTS/$SEQ" -type f 2>/dev/null | wc -l | tr -d ' ')
        if test "$STARTED_COUNT" -ge 3; then
            printf '%s\t%s\n' "$PARENT" exhausted > "$TASK_ROOT/FINAL_SEQS/$SEQ"
            TERMINAL=$((TERMINAL+1)); continue
        fi
        test "${#ATTEMPT}" -le 79 || fatal '尝试编号过长'
        sed "s/__ATTEMPT__/$ATTEMPT/g" "$TEMPLATE" > "$CONFIG" || fatal "无法生成配置 $ATTEMPT"
        RUN_LOG="$TASK_ROOT/logs/$ATTEMPT.log"
        acquire_start_lock || { write_state stopped; exit 0; }
        WHY=""; PHASE=""; START_JOB=$(date +%s); LAST_PROGRESS=$START_JOB; LAST_ACTIONS=""; STOP_SINCE=0; COMPLETE_SINCE=0
        mkdir -p "$TASK_ROOT/STARTED_ATTEMPTS/$SEQ" || fatal '无法建立启动账本'
        STARTED_COUNT=$(find "$TASK_ROOT/STARTED_ATTEMPTS/$SEQ" -type f | wc -l | tr -d ' ')
        test "$STARTED_COUNT" -lt 3 || fatal '实际启动次数已达上限'
        RUN_ORDINAL=$((STARTED_COUNT+1))
        (set -C; printf '%s\t%s\n' "$RUN_ORDINAL" "$(date +%s)" > "$TASK_ROOT/STARTED_ATTEMPTS/$SEQ/$ATTEMPT") || fatal '启动账本重复'
        { printf '{"runOrdinal":%s,' "$RUN_ORDINAL"; sed '1s/^{//' "$CONFIG"; } > "$CONFIG.ordinal"
        mv "$CONFIG.ordinal" "$CONFIG" || fatal '实际尝试序号写入失败'
        write_state starting_app
        # 资源密钥已由原生初始化补齐，锁屏也可启动采集，无需每局点亮屏幕。
        am start -n "$PACKAGE/$ACTIVITY" >> "$RUN_LOG" 2>&1
        WAIT=0
        while test -z "$(live_app_pids)" && test "$WAIT" -lt 20; do
            sync_stop
            sleep 1; WAIT=$((WAIT+1))
        done
        PIDS=$(live_app_pids)
        set -- $PIDS
        if test "$#" != 1; then WHY=app_start_not_single; log "启动后没有唯一应用PID，保留未知进程：$PIDS"
        else
            APP_PID="$1"; APP_START=$(proc_start "$APP_PID")
            if ! owned_matches "$APP_PID" "$APP_START" app; then WHY=app_identity_unconfirmed; APP_PID=""; APP_START=""
            else
                printf '%s\t%s\t%s\t%s\t%s\t%s\n' "$ATTEMPT" "$APP_PID" "$APP_START" "$(date +%s)" "$PACKAGE" "$WORKER_ID" >> "$TASK_ROOT/owned-processes.tsv"
                sh "$THAW" "$TASK_ROOT" "$APP_PID" "$APP_START" "$PACKAGE" "$APP_UID" >> "$LOG" 2>&1
                CLASSPATH="$IMPORTANCE_JAR" app_process /system/bin ProcessImportance "$TASK_ROOT" "$APP_PID" "$APP_START" "$APP_UID" "$PACKAGE" > "$RUN_LOG.importance" 2>&1 < /dev/null &
                IMPORTANCE_PID=$!; IMPORTANCE_START=$(proc_start "$IMPORTANCE_PID")
                printf '%s\t%s\t%s\t%s\n' "$ATTEMPT" "$IMPORTANCE_PID" "$IMPORTANCE_START" "$(date +%s)" >> "$TASK_ROOT/owned-importance.tsv"
                PARAMS=$(cat "$CONFIG") || fatal '无法读取已生成配置'
                "$INJECT" -p "$APP_PID" -s "$BUNDLE" -P "$PARAMS" > "$RUN_LOG.inject" 2>&1 < /dev/null &
                CHILD=$!; CHILD_START=$(proc_start "$CHILD")
                WAIT=0
                while ! owned_matches "$CHILD" "$CHILD_START" inject && test "$WAIT" -lt 3; do sleep 1; WAIT=$((WAIT+1)); done
                printf '%s\t%s\t%s\t%s\n' "$ATTEMPT" "$CHILD" "$CHILD_START" "$(date +%s)" >> "$TASK_ROOT/owned-injects.tsv"
            fi
        fi
        while test -z "$WHY"; do
            sync_stop
            sh "$THAW" "$TASK_ROOT" "$APP_PID" "$APP_START" "$PACKAGE" "$APP_UID" >> "$LOG" 2>&1
            NOW=$(date +%s)
            JOB_STATE="$OUT/STATE.json"
            PHASE=""; ACTIONS=""
            if test -f "$JOB_STATE"; then
                PHASE=$(sed -n 's/.*"standalonePhase"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$JOB_STATE")
                ACTIONS=$(sed -n 's/.*"actions"[[:space:]]*:[[:space:]]*\([0-9][0-9]*\).*/\1/p' "$JOB_STATE")
                test -n "$ACTIONS" || ACTIONS=$(sed -n 's/.*"committedActions"[[:space:]]*:[[:space:]]*\([0-9][0-9]*\).*/\1/p' "$JOB_STATE")
            fi
            case "$PHASE" in running|waiting_resources|complete|failed|truncated|stopped) release_start_lock || { WHY=start_lock_release_failed; break; } ;; esac
            case "$PHASE" in
                complete)
                    if test -f "$OUT/artifact-manifest.json" && test -f "$OUT/THREAD_EXITED.json"; then
                        if CLASSPATH="$GLOBAL_ROOT/curriculum-audit.jar" app_process /system/bin CurriculumAudit "$OUT" "$CONFIG" > "$RUN_LOG.audit" 2>&1; then WHY=complete; else WHY=log_integrity_failure; fi
                        break
                    fi
                    test "$COMPLETE_SINCE" != 0 || COMPLETE_SINCE=$NOW
                    if test "$((NOW-COMPLETE_SINCE))" -gt 10; then WHY=complete_without_thread_exit; break; fi ;;
                failed|truncated|stopped)
                    WHY="$PHASE"
                    if test "$PHASE" = failed && grep -F initial_state_mismatch "$OUT/worker-error.json" >/dev/null 2>&1; then WHY=construction_mismatch; fi
                    break ;;
            esac
            if ! owned_matches "$APP_PID" "$APP_START" app; then WHY=app_disappeared; break; fi
            if ! owned_matches "$CHILD" "$CHILD_START" inject; then WHY=inject_disappeared; break; fi
            if ! owned_matches "$IMPORTANCE_PID" "$IMPORTANCE_START" importance; then WHY=importance_guard_disappeared; break; fi
            if test -z "$PHASE" && test "$((NOW-START_JOB))" -gt 90; then WHY=no_state_90s; break; fi
            # CPU暂停只阻止继续工作，不把在途暂停误判为600秒无进展失败。
            if test -e "$PAUSE" || test "$PHASE" = waiting_resources; then LAST_PROGRESS=$NOW
            elif test "$ACTIONS" != "$LAST_ACTIONS"; then LAST_ACTIONS="$ACTIONS"; LAST_PROGRESS=$NOW
            elif test "$((NOW-LAST_PROGRESS))" -gt 600; then WHY=no_action_progress_600s; break
            fi
            if test -e "$STOP"; then
                test "$STOP_SINCE" != 0 || STOP_SINCE=$NOW
                write_state stopping
                if test "$((NOW-STOP_SINCE))" -gt 30; then WHY=stopped; break; fi
            elif test -e "$PAUSE"; then write_state paused
            elif test "$PHASE" = complete; then write_state waiting_thread_exit
            else write_state "$PHASE"; fi
            sleep 3
        done
        log "尝试结束：seq=$SEQ attempt=$ATTEMPT phase=$PHASE reason=$WHY"
        if ! cleanup_active; then
            log '本次拥有进程未退出，等待后重查，禁止同worker另起并发局'
            while ! cleanup_active; do sync_stop; write_state waiting_device; sleep 3; done
        fi
        if test "$WHY" = complete; then
            if (set -C; printf '%s\t%s\t%s\n' "$PARENT" "$ATTEMPT" "$(date +%s)" > "$TASK_ROOT/DONE_SEQS/$SEQ") 2>/dev/null; then DONE=$((DONE+1)); fi
            printf '%s\t%s\t%s\t%s\n' "$SEQ" "$PARENT" "$ATTEMPT" "$(date +%s)" >> "$TASK_ROOT/completed.tsv"
        else
            FAILED=$((FAILED+1))
            printf '%s\t%s\t%s\t%s\t%s\n' "$SEQ" "$PARENT" "$ATTEMPT" "$WHY" "$(date +%s)" >> "$TASK_ROOT/failure.tsv"
            if terminal_reason "$WHY" || test "$RUN_ORDINAL" -ge 3; then
                printf '%s\t%s\t%s\n' "$PARENT" "$ATTEMPT" "$WHY" > "$TASK_ROOT/FINAL_SEQS/$SEQ"
                TERMINAL=$((TERMINAL+1))
            else printf '%s\t%s\t%s\n' "$SEQ" "$PARENT" "$TEMPLATE" >> "$NEXT"; fi
        fi
        case "$WHY" in construction_mismatch|log_integrity_failure) printf "%s %s\n" "$SEQ" "$WHY" > "$GLOBAL_ROOT/CONSTRUCTION_BLOCK" ;; esac
        write_state between_games
        sync_stop && { write_state stopped; exit 0; }
        drain_before_start
    done < "$QUEUE"
    mv "$QUEUE" "$TASK_ROOT/queue-history/round-$SESSION-$ROUND.tsv"
    mv "$NEXT" "$TASK_ROOT/queue-history/retry-$SESSION-$ROUND.tsv"
    ACTIVE_SEQ=""; ATTEMPT=""
    if test "$((DONE+TERMINAL))" -lt "$TOTAL"; then
        write_state retry_backoff; BACKOFF=0
        while test "$BACKOFF" -lt 6; do sync_stop && { write_state stopped; exit 0; }; drain_before_start; sleep 3; BACKOFF=$((BACKOFF+3)); done
    fi
done
ACTIVE_SEQ=""; ATTEMPT=""; drain_before_start; if test "$DONE" = "$TOTAL"; then write_state complete; else write_state completed_with_gaps; fi
log "本worker的$TOTAL个分片父局已自然结束，原始证据留在手机"
