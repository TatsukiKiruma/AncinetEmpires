# 纯调档逻辑：不启动、停止或信号控制任何进程，仅更新并发状态。
smart_init() {
    ACTIVE_LIMIT="$1"; RECOVERY_TARGET=2; OPERATING_CEILING=2
    COOL_SINCE=0; RECOVERY_NOT_BEFORE=0; RESOURCE_PAUSED=0
    LAST_FAILURE_COUNT="$3"; FAILURE_WINDOW_START="$2"; RECENT_FAILURES=0
    ADAPTIVE_REASON=正常2路
}
smart_update() {
    SMART_CPU=${1%.*}; SMART_TEMP="$2"; SMART_BATTERY="$3"; SMART_FREE="$4"; SMART_FAILURES="$5"; SMART_NOW="$6"
    case "$SMART_CPU:$SMART_TEMP:$SMART_BATTERY:$SMART_FREE:$SMART_FAILURES:$SMART_NOW" in
        *[!0-9:]*|:*|*:) ACTIVE_LIMIT=0; COOL_SINCE=0; ADAPTIVE_REASON=资源读数无效暂停; return 0 ;;
    esac
    FAILURE_DELTA=$((SMART_FAILURES-LAST_FAILURE_COUNT)); LAST_FAILURE_COUNT=$SMART_FAILURES
    test "$FAILURE_DELTA" -ge 0 || FAILURE_DELTA=0
    if test "$((SMART_NOW-FAILURE_WINDOW_START))" -ge 120; then RECENT_FAILURES=0; FAILURE_WINDOW_START=$SMART_NOW; fi
    RECENT_FAILURES=$((RECENT_FAILURES+FAILURE_DELTA))
    if test "$RESOURCE_PAUSED" = 1; then
        if test "$SMART_TEMP" -le 420 && test "$SMART_BATTERY" -ge 25 && test "$SMART_FREE" -ge 2359296; then
            RESOURCE_PAUSED=0; COOL_SINCE=0; ADAPTIVE_REASON=资源恢复等待低负载
        fi
    elif test "$SMART_TEMP" -ge 450 || test "$SMART_BATTERY" -lt 20 || test "$SMART_FREE" -lt 2097152; then
        RESOURCE_PAUSED=1
    fi
    if test "$RESOURCE_PAUSED" = 1; then
        ACTIVE_LIMIT=0; COOL_SINCE=0; ADAPTIVE_REASON=温度电量或空间守护暂停; return 0
    fi
    if test "$SMART_CPU" -ge 90; then
        test "$ACTIVE_LIMIT" -le 0 || ACTIVE_LIMIT=$((ACTIVE_LIMIT-1))
        STOP_INCREASING=1; COOL_SINCE=0
        test "$RECOVERY_NOT_BEFORE" -ge "$((SMART_NOW+60))" || RECOVERY_NOT_BEFORE=$((SMART_NOW+60))
        ADAPTIVE_REASON=CPU达到90逐档回退
        return 0
    fi
    if test "$RECENT_FAILURES" -ge 3; then
        test "$ACTIVE_LIMIT" -le 1 || ACTIVE_LIMIT=$((ACTIVE_LIMIT-1))
        RECENT_FAILURES=0; FAILURE_WINDOW_START=$SMART_NOW
        RECOVERY_NOT_BEFORE=$((SMART_NOW+120)); COOL_SINCE=0
        ADAPTIVE_REASON=失败密集暂降并发
        return 0
    fi
    if test "$SMART_CPU" -lt 75; then
        test "$COOL_SINCE" != 0 || COOL_SINCE=$SMART_NOW
        if test "$ACTIVE_LIMIT" -lt "$RECOVERY_TARGET" && test "$((SMART_NOW-COOL_SINCE))" -ge 30 && test "$SMART_NOW" -ge "$RECOVERY_NOT_BEFORE"; then
            ACTIVE_LIMIT=$((ACTIVE_LIMIT+1)); COOL_SINCE=$SMART_NOW
            ADAPTIVE_REASON=持续低负载逐档恢复
        elif test "$ACTIVE_LIMIT" = "$RECOVERY_TARGET"; then ADAPTIVE_REASON=正常2路
        fi
    else
        COOL_SINCE=0
    fi
    test "$ACTIVE_LIMIT" -le "$OPERATING_CEILING" || ACTIVE_LIMIT=$OPERATING_CEILING
}
