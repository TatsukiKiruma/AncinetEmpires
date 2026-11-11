#!/system/bin/sh
# 手机本地总调度器：只用暂停文件调节并发，不向不明进程发信号。
umask 077
GLOBAL_ROOT="$1"
case "$GLOBAL_ROOT" in
    /data/local/tmp/aeii-hard-concurrency-*) SUFFIX=${GLOBAL_ROOT#/data/local/tmp/aeii-hard-concurrency-} ;;
    /data/local/tmp/aeii-hard-production-parallel-*) SUFFIX=${GLOBAL_ROOT#/data/local/tmp/aeii-hard-production-parallel-} ;;
    *) exit 2 ;;
esac
case "$SUFFIX" in ''|*[!A-Za-z0-9_-]*) exit 2 ;; esac
test -d "$GLOBAL_ROOT" && test -f "$GLOBAL_ROOT/global.env" && test -f "$GLOBAL_ROOT/workers.tsv" || exit 2
env_number() { tr -d '\r' < "$GLOBAL_ROOT/global.env" | sed -n "s/^$1=\([0-9][0-9]*\)$/\1/p"; }
TOTAL=$(env_number TOTAL)
INITIAL_DONE=$(env_number INITIAL_DONE)
ACTIVE_LIMIT=$(env_number LIMIT)
WORKER_COUNT=$(env_number WORKER_COUNT)
for VALUE in "$TOTAL" "$INITIAL_DONE" "$ACTIVE_LIMIT" "$WORKER_COUNT"; do
    case "$VALUE" in ''|*[!0-9]*) exit 2 ;; esac
done
test "$WORKER_COUNT" -ge 1 && test "$WORKER_COUNT" -le 4 && test "$ACTIVE_LIMIT" -le "$WORKER_COUNT" && test "$INITIAL_DONE" -le "$TOTAL" || exit 2
mkdir -p "$GLOBAL_ROOT/logs" "$GLOBAL_ROOT/history" || exit 2
SESSION="$(date +%s)-$$"
LOG="$GLOBAL_ROOT/logs/master-$SESSION.log"
CHILDREN="$GLOBAL_ROOT/history/children-$SESSION.tsv"
WORKERS="$GLOBAL_ROOT/history/workers-input-$SESSION.tsv"
tr -d '\r' < "$GLOBAL_ROOT/workers.tsv" > "$WORKERS"
LATCH="$GLOBAL_ROOT/STOP_INCREASING"
STOP_INCREASING=0; test ! -e "$LATCH" || STOP_INCREASING=1
STOPPING=0; AUTO_ZERO=0; COMPLETING=0; ITERATION=0; DONE="$INITIAL_DONE"; CPU=null; TEMPERATURE=null; ALIVE_COUNT=0
ROTATION_OFFSET=0; LAST_ROTATION_TIME=$(date +%s); ELIGIBLE_COUNT=$WORKER_COUNT
if test "$STOP_INCREASING" = 1; then
    OLD_LIMIT=$(sed -n 's/.*"activeLimit"[[:space:]]*:[[:space:]]*\([0-9][0-9]*\).*/\1/p' "$GLOBAL_ROOT/STATE.json" 2>/dev/null)
    case "$OLD_LIMIT" in ''|*[!0-9]*) OLD_LIMIT=0 ;; esac
    test "$ACTIVE_LIMIT" -le "$OLD_LIMIT" || ACTIVE_LIMIT=$OLD_LIMIT
    test "$ACTIVE_LIMIT" != 0 || AUTO_ZERO=1
fi
WAKE_NAME="aeii-parallel-$SESSION"

log() { printf '%s\t%s\n' "$(date +%s)" "$*" >> "$LOG"; }
proc_ticks() { sed 's/.*) //' "/proc/$1/stat" 2>/dev/null | awk '$1!="Z" && $1!="X" && $1!="x" {print $20}'; }
alive() { test -n "$1" && test -n "$2" && test "$(proc_ticks "$1")" = "$2"; }
# 显式接管/档位文件必须由root独占维护，拒绝链接和可被普通用户改写的输入。
trusted_control_file() {
    test -f "$1" && test ! -L "$1" || return 1
    read -r META_OWNER META_GROUP META_MODE <<EOF
$(stat -c '%u %g %a' "$1" 2>/dev/null)
EOF
    test "$META_OWNER" = 2000 && test "$META_GROUP" = 2000 || return 1
    MODE_TAIL=$(printf '%s' "$META_MODE" | sed 's/.*\(..\)$/\1/')
    case "$MODE_TAIL" in [0145][0145]) return 0 ;; *) return 1 ;; esac
}
OPERATING_CEILING=0; CEILING_MODE=0; RECOVERY_TARGET=0; COOL_SINCE=0; ADOPT_MODE=0
if test -e "$GLOBAL_ROOT/OPERATING_CEILING"; then
    trusted_control_file "$GLOBAL_ROOT/OPERATING_CEILING" || { log '档位文件身份或权限不可信'; exit 2; }
    OPERATING_CEILING=$(tr -d '\r\n' < "$GLOBAL_ROOT/OPERATING_CEILING")
    test "$OPERATING_CEILING" -ge 1 && test "$OPERATING_CEILING" -le 3 && test "$WORKER_COUNT" -ge "$OPERATING_CEILING" || { log '本轮选定档位必须为1至3'; exit 2; }
    CEILING_MODE=1; RECOVERY_TARGET=$ACTIVE_LIMIT; AUTO_ZERO=0
    test "$ACTIVE_LIMIT" -le "$OPERATING_CEILING" || ACTIVE_LIMIT=$OPERATING_CEILING
fi

. "$GLOBAL_ROOT/smart_governor.sh" || exit 2
failure_total() {
    SUM_FAILURES=0
    while read -r FWID FPKG FUID FROOT FEXTRA; do
        FCOUNT=$(sed -n 's/.*"failedAttempts":\([0-9][0-9]*\).*/\1/p' "$FROOT/STATE.json" 2>/dev/null)
        case "$FCOUNT" in ''|*[!0-9]*) FCOUNT=0 ;; esac
        SUM_FAILURES=$((SUM_FAILURES+FCOUNT))
    done < "$GLOBAL_ROOT/workers.tsv"
    printf '%s\n' "$SUM_FAILURES"
}
smart_init 3 "$(awk '{print int($1)}' /proc/uptime)" "$(failure_total)"
LOCK="$GLOBAL_ROOT/master.lock"
if ! mkdir "$LOCK" 2>/dev/null; then
    read -r OLD_PID OLD_TICKS < "$LOCK/identity" 2>/dev/null
    alive "$OLD_PID" "$OLD_TICKS" && exit 3
    mv "$LOCK" "$GLOBAL_ROOT/history/stale-master-lock-$SESSION" || exit 3
    mkdir "$LOCK" || exit 3
fi
printf '%s\t%s\n' "$$" "$(proc_ticks "$$")" > "$LOCK/identity"
release() {
    test ! -w /sys/power/wake_unlock || printf '%s' "$WAKE_NAME" > /sys/power/wake_unlock 2>/dev/null
    mv "$LOCK" "$GLOBAL_ROOT/history/master-lock-$SESSION" 2>/dev/null
}
trap release EXIT
test ! -w /sys/power/wake_lock || printf '%s' "$WAKE_NAME" > /sys/power/wake_lock

# 输入全检查通过后才启动子控制器；每个worker只启动一次。
COUNT=0
while read -r WID PKG APP_UID FLAT_ROOT EXTRA; do
    test -n "$WID" || continue
    case "$WID" in w00|w01|w02|w03) ;; *) log "非法worker编号 $WID"; exit 2 ;; esac
    case "$PKG" in ''|*[!A-Za-z0-9_.]*) exit 2 ;; esac
    case "$APP_UID" in ''|*[!0-9]*) exit 2 ;; esac
    case "$FLAT_ROOT" in
        /data/local/tmp/aeii-hard-concurrency-*) LEAF=${FLAT_ROOT#/data/local/tmp/aeii-hard-concurrency-} ;;
        /data/local/tmp/aeii-hard-production-parallel-*) LEAF=${FLAT_ROOT#/data/local/tmp/aeii-hard-production-parallel-} ;;
        *) exit 2 ;;
    esac
    case "$LEAF" in ''|*[!A-Za-z0-9_-]*) exit 2 ;; esac
    test -z "$EXTRA" && test -f "$FLAT_ROOT/controller.sh" || exit 2
    COUNT=$((COUNT+1))
done < "$WORKERS"
test "$COUNT" = "$WORKER_COUNT" || exit 2
test "$(awk '{print $1}' "$WORKERS" | sort -u | wc -l | tr -d ' ')" = "$COUNT" || exit 2

# 接管文件沿用workerId/PID/startTicks/root四列；全部匹配后才接管，不启动替代进程。
if test -e "$GLOBAL_ROOT/ADOPT_CHILDREN.tsv"; then
    trusted_control_file "$GLOBAL_ROOT/ADOPT_CHILDREN.tsv" || { log '接管文件身份或权限不可信'; exit 2; }
    ADOPT_SNAPSHOT="$GLOBAL_ROOT/history/adopt-input-$SESSION.tsv"
    tr -d '\r' < "$GLOBAL_ROOT/ADOPT_CHILDREN.tsv" > "$ADOPT_SNAPSHOT"
    ADOPT_COUNT=0
    while read -r ADOPT_ID ADOPT_PID ADOPT_TICKS ADOPT_ROOT ADOPT_EXTRA; do
        test -n "$ADOPT_ID" || continue
        case "$ADOPT_PID:$ADOPT_TICKS" in *[!0-9:]*|:*|*:) log '接管PID或时钟非法'; exit 2 ;; esac
        EXPECTED_ROOT=$(awk -v id="$ADOPT_ID" '$1==id{print $4}' "$WORKERS")
        test -n "$EXPECTED_ROOT" && test "$ADOPT_ROOT" = "$EXPECTED_ROOT" && test -z "$ADOPT_EXTRA" || { log "接管root不匹配：$ADOPT_ID"; exit 2; }
        alive "$ADOPT_PID" "$ADOPT_TICKS" || { log "接管进程已退出或身份变化：$ADOPT_ID pid=$ADOPT_PID"; exit 2; }
        ADOPT_COUNT=$((ADOPT_COUNT+1))
    done < "$ADOPT_SNAPSHOT"
    test "$ADOPT_COUNT" = "$WORKER_COUNT" && test "$(awk '{print $1}' "$ADOPT_SNAPSHOT" | sort -u | wc -l | tr -d ' ')" = "$ADOPT_COUNT" && test "$(awk '{print $2}' "$ADOPT_SNAPSHOT" | sort -u | wc -l | tr -d ' ')" = "$ADOPT_COUNT" || { log '接管数量、worker编号或PID重复'; exit 2; }
    cp "$ADOPT_SNAPSHOT" "$CHILDREN" || exit 2
    ADOPT_MODE=1
    log "无损接管$ADOPT_COUNT个已核验控制器，保留全部子root计数"
fi

request_stop() {
    STOPPING=1
    while read -r WID PKG APP_UID FLAT_ROOT EXTRA; do
        test -n "$WID" || continue
        : > "$FLAT_ROOT/STOP"
    done < "$WORKERS"
}
trap request_stop INT TERM
apply_limit() {
    # 每次仅前移一个起点，避免静态分片在降并发后永久得不到执行机会。
    ROTATION_NOW=$(date +%s)
    if test ! -e "$GLOBAL_ROOT/STRESS_MODE" && test "$((ROTATION_NOW-LAST_ROTATION_TIME))" -ge 60; then
        ROTATION_OFFSET=$(((ROTATION_OFFSET+1)%WORKER_COUNT))
        LAST_ROTATION_TIME=$ROTATION_NOW
        log "轮转未完成分片，起点=$ROTATION_OFFSET，并发上限仍为$ACTIVE_LIMIT"
    fi
    ELIGIBLE="$GLOBAL_ROOT/.eligible-$SESSION.tmp"
    SELECTED="$GLOBAL_ROOT/.selected-$SESSION.tmp"
    : > "$ELIGIBLE"
    ELIGIBLE_COUNT=0
    RANK=0
    while read -r WID PKG APP_UID FLAT_ROOT EXTRA; do
        test -n "$WID" || continue
        ELIGIBLE_NOW=1
        # 首次启动尚无子PID回执时全部可选；此后只调度仍活着且未完成的分片。
        if test -s "$CHILDREN"; then
            CHILD_PID=$(awk -v id="$WID" '$1==id{print $2}' "$CHILDREN")
            CHILD_TICKS=$(awk -v id="$WID" '$1==id{print $3}' "$CHILDREN")
            alive "$CHILD_PID" "$CHILD_TICKS" || ELIGIBLE_NOW=0
            CHILD_PHASE=$(sed -n 's/.*"phase"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$FLAT_ROOT/STATE.json" 2>/dev/null)
            case "$CHILD_PHASE" in complete|drained|stopped) ELIGIBLE_NOW=0 ;; esac
        fi
        if test "$ELIGIBLE_NOW" = 1; then
            printf '%s\t%s\n' "$RANK" "$WID" >> "$ELIGIBLE"
            ELIGIBLE_COUNT=$((ELIGIBLE_COUNT+1))
        fi
        RANK=$((RANK+1))
    done < "$WORKERS"
    awk -v offset="$ROTATION_OFFSET" -v n="$WORKER_COUNT" '{print ($1-offset+n)%n,$2}' "$ELIGIBLE" |
        sort -n | awk -v cap="$ACTIVE_LIMIT" 'NR<=cap{print $2}' > "$SELECTED"
    while read -r WID PKG APP_UID FLAT_ROOT EXTRA; do
        test -n "$WID" || continue
        if ! grep -qx "$WID" "$SELECTED"; then
            test -e "$GLOBAL_ROOT/PAUSE-$WID" || printf '%s\n' "$SESSION" > "$GLOBAL_ROOT/PAUSE-$WID"
        else
            # 仅清理本任务约定的单个暂停控制文件，原始数据不变。
            test ! -e "$GLOBAL_ROOT/PAUSE-$WID" || rm -f "$GLOBAL_ROOT/PAUSE-$WID"
        fi
    done < "$WORKERS"
    # 暂停由动作边界消费；轮转换出一个worker时，至多还会重叠一个在途动作。
}
write_state() {
    DONE="$INITIAL_DONE"; FIRST=1; ALIVE_COUNT=0
    SNAPSHOTS="$GLOBAL_ROOT/.workers-$SESSION.tmp"
    : > "$SNAPSHOTS"
    while read -r WID PKG APP_UID FLAT_ROOT EXTRA; do
        test -n "$WID" || continue
        CHILD_PID=$(awk -v id="$WID" '$1==id{print $2}' "$CHILDREN" 2>/dev/null)
        CHILD_TICKS=$(awk -v id="$WID" '$1==id{print $3}' "$CHILDREN" 2>/dev/null)
        CHILD_ALIVE=false
        if alive "$CHILD_PID" "$CHILD_TICKS"; then CHILD_ALIVE=true; ALIVE_COUNT=$((ALIVE_COUNT+1)); fi
        RAW_STATE=$(cat "$FLAT_ROOT/STATE.json" 2>/dev/null)
        case "$RAW_STATE" in \{*\}) ;; *) RAW_STATE='{}' ;; esac
        CHILD_DONE=$(printf '%s\n' "$RAW_STATE" | sed -n 's/.*"doneParents"[[:space:]]*:[[:space:]]*\([0-9][0-9]*\).*/\1/p')
        case "$CHILD_DONE" in ''|*[!0-9]*) CHILD_DONE=0 ;; esac
        DONE=$((DONE+CHILD_DONE))
        test "$FIRST" = 1 || printf ',' >> "$SNAPSHOTS"
        FIRST=0
        printf '{"workerId":"%s","package":"%s","root":"%s","controllerPid":"%s","controllerAlive":%s,"state":%s}' \
            "$WID" "$PKG" "$FLAT_ROOT" "$CHILD_PID" "$CHILD_ALIVE" "$RAW_STATE" >> "$SNAPSHOTS"
        if test "$CHILD_ALIVE" = false && test -n "$CHILD_PID" && test ! -e "$GLOBAL_ROOT/history/noticed-exit-$WID-$SESSION"; then
            log "子控制器已退出，其他worker继续：$WID pid=$CHILD_PID"
            : > "$GLOBAL_ROOT/history/noticed-exit-$WID-$SESSION"
        fi
    done < "$WORKERS"
    STOP_JSON=false; test "$STOP_INCREASING" != 1 || STOP_JSON=true
    ADOPT_JSON=false; test "$ADOPT_MODE" != 1 || ADOPT_JSON=true
    REMAINING=$((TOTAL-DONE)); test "$REMAINING" -ge 0 || REMAINING=0
    {
        printf '{"schema":"hard-phone-process-master-v1","phase":"%s","doneParents":%s,"remainingParents":%s,"total":%s,"initialDone":%s,"cpuPercent":%s,"cpuNormalization":"all_cores_total_100_excluding_iowait","batteryTemperatureC":%s,"activeLimit":%s,"operatingCeiling":%s,"recoveryTarget":%s,"coolSinceUptime":%s,"adoptedControllers":%s,"adaptiveReason":"%s","resourcePaused":%s,"recoveryNotBeforeUptime":%s,"recentFailureAttempts":%s,"eligibleWorkers":%s,"rotationOffset":%s,"stopIncreasing":%s,"masterPid":%s,"updatedEpoch":%s,"workers":[' \
            "$1" "$DONE" "$REMAINING" "$TOTAL" "$INITIAL_DONE" "$CPU" "$TEMPERATURE" "$ACTIVE_LIMIT" "$OPERATING_CEILING" "$RECOVERY_TARGET" "$COOL_SINCE" "$ADOPT_JSON" "$ADAPTIVE_REASON" "$RESOURCE_PAUSED" "$RECOVERY_NOT_BEFORE" "$RECENT_FAILURES" "$ELIGIBLE_COUNT" "$ROTATION_OFFSET" "$STOP_JSON" "$$" "$(date +%s)"
        cat "$SNAPSHOTS"
        printf ']}\n'
    } > "$GLOBAL_ROOT/STATE.json.tmp-$SESSION"
    mv "$GLOBAL_ROOT/STATE.json.tmp-$SESSION" "$GLOBAL_ROOT/STATE.json"
}

apply_limit
if test "$ADOPT_MODE" != 1; then
    : > "$CHILDREN"
    while read -r WID PKG APP_UID FLAT_ROOT EXTRA; do
        test -n "$WID" || continue
        setsid sh "$FLAT_ROOT/controller.sh" "$FLAT_ROOT" > "$GLOBAL_ROOT/logs/$WID-$SESSION.log" 2>&1 < /dev/null &
        CHILD_PID=$!
        printf '%s\t%s\t%s\t%s\n' "$WID" "$CHILD_PID" "$(proc_ticks "$CHILD_PID")" "$FLAT_ROOT" >> "$CHILDREN"
        log "启动worker：$WID pid=$CHILD_PID root=$FLAT_ROOT"
    done < "$WORKERS"
fi
read -r PREV_TOTAL PREV_IDLE PREV_IO <<EOF
$(awk 'NR==1{s=0;for(i=2;i<=9;i++)s+=$i;print s,$5,$6;exit}' /proc/stat)
EOF
write_state starting
while :; do
    sleep 5
    ITERATION=$((ITERATION+1))
    read -r CURRENT_TOTAL CURRENT_IDLE CURRENT_IO <<EOF
$(awk 'NR==1{s=0;for(i=2;i<=9;i++)s+=$i;print s,$5,$6;exit}' /proc/stat)
EOF
    CPU=$(awk -v t="$((CURRENT_TOTAL-PREV_TOTAL))" -v idle="$((CURRENT_IDLE-PREV_IDLE))" -v io="$((CURRENT_IO-PREV_IO))" 'BEGIN{if(t>0)printf "%.3f",100*(t-idle-io)/t;else printf "null"}')
    PREV_TOTAL=$CURRENT_TOTAL; PREV_IDLE=$CURRENT_IDLE; PREV_IO=$CURRENT_IO
    BATTERY_DUMP=$(dumpsys battery)
    TEMP_RAW=$(printf '%s\n' "$BATTERY_DUMP" | sed -n 's/^[[:space:]]*temperature:[[:space:]]*\([0-9][0-9]*\).*/\1/p')
    case "$TEMP_RAW" in ''|*[!0-9]*) TEMPERATURE=null ;; *) TEMPERATURE=$(awk -v v="$TEMP_RAW" 'BEGIN{printf "%.1f",v/10}') ;; esac
    if test -e "$GLOBAL_ROOT/SELECTED_LIMIT" && trusted_control_file "$GLOBAL_ROOT/SELECTED_LIMIT"; then
        FINAL_LIMIT=$(cat "$GLOBAL_ROOT/SELECTED_LIMIT")
        case "$FINAL_LIMIT" in 1|2|3)
            if test "$FINAL_LIMIT" -le "$OPERATING_CEILING"; then
                OPERATING_CEILING=$FINAL_LIMIT
                test "$RECOVERY_TARGET" -le "$FINAL_LIMIT" || RECOVERY_TARGET=$FINAL_LIMIT
                test "$ACTIVE_LIMIT" -le "$FINAL_LIMIT" || ACTIVE_LIMIT=$FINAL_LIMIT
            fi ;;
        esac
    fi
    GOVERNOR_NOW=$(awk '{print int($1)}' /proc/uptime)
    PREVIOUS_LIMIT=$ACTIVE_LIMIT
    PREVIOUS_REASON=$ADAPTIVE_REASON
    BATTERY_LEVEL=$(printf '%s\n' "$BATTERY_DUMP" | sed -n 's/^[[:space:]]*level:[[:space:]]*\([0-9][0-9]*\).*/\1/p')
    FREE_KIB=$(df -k /data | awk 'NR==2{print $4}')
    smart_update "$CPU" "$TEMP_RAW" "$BATTERY_LEVEL" "$FREE_KIB" "$(failure_total)" "$GOVERNOR_NOW"
    if test "$PREVIOUS_LIMIT" != "$ACTIVE_LIMIT" || test "$PREVIOUS_REASON" != "$ADAPTIVE_REASON"; then
        log "智能调档：$PREVIOUS_LIMIT -> $ACTIVE_LIMIT，原因=$ADAPTIVE_REASON，CPU=$CPU，温度=$TEMPERATURE，电量=$BATTERY_LEVEL，空间KiB=$FREE_KIB"
    fi
    if test "$STOP_INCREASING" = 1; then
        test -e "$LATCH" || printf '%s\t%s\n' "$(date +%s)" "$CPU" > "$LATCH"
    fi
    if test -e "$GLOBAL_ROOT/REQUEST_LIMIT"; then
        trusted_control_file "$GLOBAL_ROOT/REQUEST_LIMIT" || exit 2
        REQUESTED=$(cat "$GLOBAL_ROOT/REQUEST_LIMIT")
        case "$REQUESTED" in 1|2|3)
            RECOVERY_TARGET=$REQUESTED
            test "$ACTIVE_LIMIT" -le "$REQUESTED" || ACTIVE_LIMIT=$REQUESTED
            ;;
        esac
        mv "$GLOBAL_ROOT/REQUEST_LIMIT" "$GLOBAL_ROOT/history/REQUEST_LIMIT-$SESSION-$ITERATION.txt"
    fi
    apply_limit
    if test -e "$GLOBAL_ROOT/GLOBAL_STOP" || test -e "$GLOBAL_ROOT/STOP" || test "$STOPPING" = 1; then request_stop; fi
    if test "$STOPPING" = 1; then write_state stopping; else write_state running; fi
    if test "$DONE" -ge "$TOTAL"; then COMPLETING=1; request_stop; fi
    if test "$COMPLETING" = 1; then
        if test "$ALIVE_COUNT" = 0; then write_state complete; break; else write_state completing; continue; fi
    fi
    if test "$STOPPING" = 1 && test "$ALIVE_COUNT" = 0; then write_state stopped; break; fi
    if test "$ALIVE_COUNT" = 0; then write_state workers_exited; log '全部子控制器退出，未伪造完成'; exit 1; fi
done
exit 0
