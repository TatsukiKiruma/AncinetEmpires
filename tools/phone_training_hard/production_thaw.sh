#!/system/bin/sh
# 仅解冻本次拥有的应用和有真实绑定证据的渲染进程；失败不阻断采集队列。
# 用法：production_thaw.sh TASK_ROOT MAIN_PID STARTTICKS
TASK_ROOT="$1"
MAIN_PID="$2"
MAIN_TICKS="$3"
PACKAGE=net.toyknight.aeii.android
MAIN_UID=10779
case "$TASK_ROOT" in /data/local/tmp/aeii-hard-production-*) ;; *) exit 0 ;; esac
SUFFIX=${TASK_ROOT#/data/local/tmp/aeii-hard-production-}
case "$SUFFIX" in ''|*[!A-Za-z0-9_-]*) exit 0 ;; esac
case "$MAIN_PID:$MAIN_TICKS" in *[!0-9:]*|:*|*:) exit 0 ;; esac
test -d "$TASK_ROOT" || exit 0
LOG="$TASK_ROOT/thaw.log"
CACHE="$TASK_ROOT/thaw-renderers-$MAIN_PID-$MAIN_TICKS.tsv"
TMP="$CACHE.tmp-$$"
SERVICES="$TASK_ROOT/thaw-services-$MAIN_PID-$MAIN_TICKS.tmp-$$"
NOW=$(date +%s)

log() { printf '%s\t%s\n' "$(date +%s)" "$*" >> "$LOG"; }
identity_matches() {
    # 不读取cmdline；部分Android内核在进程退出竞态中会重复返回其NUL填充。
    test -r "/proc/$1/stat" && test -r "/proc/$1/status" || return 1
    PROC_STAT=$(sed 's/.*) //' "/proc/$1/stat" 2>/dev/null)
    PROC_STATE=$(printf '%s\n' "$PROC_STAT" | awk '{print $1}')
    PROC_TICKS=$(printf '%s\n' "$PROC_STAT" | awk '{print $20}')
    case "$PROC_STATE" in ''|Z|X|x) return 1 ;; esac
    test "$PROC_TICKS" = "$2" || return 1
    PROC_UID=$(awk '/^Uid:/{print $2;exit}' "/proc/$1/status" 2>/dev/null)
    test "$PROC_UID" = "$3"
}
is_frozen() {
    if test -r "/proc/$1/wchan" && grep -q __refrigerator "/proc/$1/wchan" 2>/dev/null; then return 0; fi
    for NODE in /sys/fs/cgroup/freezer/perf/frozen/cgroup.procs /sys/fs/cgroup/freezer/perf/frozen/tasks; do
        if test -r "$NODE" && grep -qx "$1" "$NODE" 2>/dev/null; then return 0; fi
    done
    return 1
}
thaw_one() {
    identity_matches "$MAIN_PID" "$MAIN_TICKS" "$MAIN_UID" || return 0
    identity_matches "$1" "$2" "$3" || return 0
    is_frozen "$1" || return 0
    # 发命令前再次核对启动时钟和UID，避免PID复用；不使用全局thaw。
    identity_matches "$1" "$2" "$3" || return 0
    log "定向解冻 pid=$1 start=$2 uid=$3 main=$MAIN_PID/$MAIN_TICKS"
    if command -v timeout >/dev/null 2>&1; then
        timeout 3 cmd greezer thpid "$1" 9999 >> "$LOG" 2>&1
    else
        log '本机缺少timeout，跳过可能阻塞的解冻命令'
        return 0
    fi
    RESULT=$?
    test "$RESULT" = 0 || log "定向解冻返回非零：pid=$1 code=$RESULT"
}
identity_matches "$MAIN_PID" "$MAIN_TICKS" "$MAIN_UID" || exit 0
thaw_one "$MAIN_PID" "$MAIN_TICKS" "$MAIN_UID"

# 缓存绑定主进程身份，最多30秒重读一次真实服务关系。
CACHE_OK=0
if test -f "$CACHE"; then
    read -r CACHE_MAIN CACHE_TICKS CACHE_TIME < "$CACHE"
    case "$CACHE_TIME" in ''|*[!0-9]*) CACHE_TIME=0 ;; esac
    if test "$CACHE_MAIN" = "$MAIN_PID" && test "$CACHE_TICKS" = "$MAIN_TICKS" && test "$((NOW-CACHE_TIME))" -lt 30; then
        CACHE_OK=1
        while read -r PID TICKS ROW_UID EXTRA; do
            case "$PID:$TICKS:$ROW_UID" in *[!0-9:]*|:*|*:) CACHE_OK=0; break ;; esac
            if ! identity_matches "$PID" "$TICKS" "$ROW_UID"; then CACHE_OK=0; break; fi
        done <<EOF
$(tail -n +2 "$CACHE")
EOF
    fi
fi
if test "$CACHE_OK" != 1; then
    command -v timeout >/dev/null 2>&1 || exit 0
    timeout 3 dumpsys activity services "$PACKAGE" > "$SERVICES" 2>> "$LOG"
    if test "$?" != 0; then log '读取渲染服务绑定失败，暂只守护主进程'; rm -f "$SERVICES"; exit 0; fi
    printf '%s\t%s\t%s\n' "$MAIN_PID" "$MAIN_TICKS" "$NOW" > "$TMP"
    # 同一ServiceRecord内必须同时出现本包caller、隔离renderer和本次主进程client。
    awk -v main="$MAIN_PID" -v pkg="$PACKAGE" '
        function flush() { if (owned && caller && client && renderer != "" && isolated != "") print renderer, 99000 + isolated }
        /^[[:space:]]*\* ServiceRecord\{/ { flush(); owned=index($0," " pkg "/org.chromium.content.app.SandboxedProcessService")>0; caller=0; client=0; renderer=""; isolated="" }
        owned && /callerPackage=/ { if (index($0,"callerPackage=" pkg)>0) caller=1 }
        owned && /isolatedProc=ProcessRecord\{/ {
            line=$0; sub(/^.*ProcessRecord\{[^ ]* /,"",line); sub(/:.*/,"",line)
            if (line ~ /^[0-9]+$/ && $0 ~ /\/u0a779i[0-9]+}/) {
                renderer=line; line=$0; sub(/^.*\/u0a779i/,"",line); sub(/}.*/,"",line); isolated=line
            }
        }
        owned && /Client AppBindRecord/ {
            if (index($0," " main ":" pkg "/u0a779}")>0) client=1
        }
        END { flush() }
    ' "$SERVICES" | while read -r RPID RUID; do
        case "$RPID:$RUID" in *[!0-9:]*|:*|*:) continue ;; esac
        RTICKS=$(sed 's/.*) //' "/proc/$RPID/stat" 2>/dev/null | awk '{print $20}')
        if identity_matches "$MAIN_PID" "$MAIN_TICKS" "$MAIN_UID" && identity_matches "$RPID" "$RTICKS" "$RUID"; then
            printf '%s\t%s\t%s\n' "$RPID" "$RTICKS" "$RUID" >> "$TMP"
        fi
    done
    mv "$TMP" "$CACHE"
    rm -f "$SERVICES"
fi
while read -r PID TICKS ROW_UID EXTRA; do
    case "$PID:$TICKS:$ROW_UID" in *[!0-9:]*|:*|*:) continue ;; esac
    thaw_one "$PID" "$TICKS" "$ROW_UID"
done <<EOF
$(tail -n +2 "$CACHE" 2>/dev/null)
EOF
exit 0
