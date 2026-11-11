#!/system/bin/sh
# Android9专用：只发布本次宿主及具有精确ServiceRecord/Client绑定的renderer。
# 避开本机旧awk的复杂表达式缺陷，不修改全局后台阈值或cgroup。
umask 077
TASK_ROOT="$1"; MAIN_PID="$2"; MAIN_TICKS="$3"; PACKAGE="$4"; MAIN_UID="$5"
case "$TASK_ROOT" in /data/local/tmp/aeii-hard-production-parallel-samsung-20261023-03-w0[012]) ;; *) exit 2 ;; esac
case "$PACKAGE" in net.toyknight.aeii.worker11|net.toyknight.aeii.worker12|net.toyknight.aeii.worker13) ;; *) exit 2 ;; esac
case "$MAIN_PID:$MAIN_TICKS:$MAIN_UID" in *[!0-9:]*|:*|*:) exit 2 ;; esac
test "$MAIN_PID" -gt 1 && test "$MAIN_UID" -ge 10000 && test "$MAIN_UID" -lt 20000 || exit 2
OWNER_TAG="u0a$((MAIN_UID-10000))"
identity() {
    case "$1:$2:$3" in *[!0-9:]*|:*|*:) return 1 ;; esac
    test "$1" -gt 1 || return 1
    read -r RAW_STAT < "/proc/$1/stat" 2>/dev/null || return 1
    FIELDS=${RAW_STAT##*) }
    SAVED_PID="$1"; SAVED_TICKS="$2"; SAVED_UID="$3"
    set -- $FIELDS
    case "$1" in ''|Z|X|x) return 1 ;; esac
    test "$#" -ge 20 || return 1
    shift 19
    test "$1" = "$SAVED_TICKS" || return 1
    FOUND_UID=""
    while read -r KEY V1 V2 V3 V4; do
        if test "$KEY" = Uid:; then
            test "$V1" = "$SAVED_UID" && test "$V2" = "$V1" && test "$V3" = "$V1" && test "$V4" = "$V1" || return 1
            FOUND_UID=$V1; break
        fi
    done < "/proc/$SAVED_PID/status"
    test -n "$FOUND_UID"
}
TARGET="$TASK_ROOT/important-targets.tsv"; TEMP="$TARGET.tmp-$$"
: > "$TEMP" || exit 2
if ! identity "$MAIN_PID" "$MAIN_TICKS" "$MAIN_UID"; then mv "$TEMP" "$TARGET"; exit 0; fi
printf '%s\t%s\t%s\n' "$MAIN_PID" "$MAIN_TICKS" "$MAIN_UID" >> "$TEMP"
SERVICES="$TASK_ROOT/services-$MAIN_PID-$MAIN_TICKS.txt"
timeout 3 dumpsys activity services "$PACKAGE" > "$SERVICES.tmp-$$" 2>/dev/null || { mv "$TEMP" "$TARGET"; exit 0; }
mv "$SERVICES.tmp-$$" "$SERVICES"
OWNED=0; CLIENT=0; RPID=""; RUID=""
flush_renderer() {
    test "$OWNED:$CLIENT" = 1:1 && test -n "$RPID" && test -n "$RUID" || return 0
    read -r RSTAT < "/proc/$RPID/stat" 2>/dev/null || return 0
    RFIELDS=${RSTAT##*) }; set -- $RFIELDS
    test "$#" -ge 20 || return 0
    shift 19; RTICKS="$1"
    if identity "$MAIN_PID" "$MAIN_TICKS" "$MAIN_UID" && identity "$RPID" "$RTICKS" "$RUID"; then
        printf '%s\t%s\t%s\n' "$RPID" "$RTICKS" "$RUID" >> "$TEMP"
    fi
}
while IFS= read -r LINE; do
    case "$LINE" in
        *"* ServiceRecord{"*)
            flush_renderer
            OWNED=0; CLIENT=0; RPID=""; RUID=""
            case "$LINE" in *" $PACKAGE/org.chromium.content.app.SandboxedProcessService"*) OWNED=1 ;; esac ;;
        *"isolatedProc=ProcessRecord{"*)
            test "$OWNED" = 1 || continue
            case "$LINE" in *"/$OWNER_TAG"i*) ;; *) continue ;; esac
            RPART=${LINE#*ProcessRecord\{}; RPART=${RPART#* }; RPID=${RPART%%:*}
            IPART=${LINE#*/$OWNER_TAG\i}; IPART=${IPART%%\}*}
            case "$RPID:$IPART" in *[!0-9:-]*|:*|*:) RPID=""; continue ;; esac
            RUID=$((99000+IPART))
            test "$RUID" -ge 90000 && test "$RUID" -lt 100000 || { RPID=""; RUID=""; } ;;
        *"Client AppBindRecord"*)
            case "$LINE" in *" $MAIN_PID:$PACKAGE/$OWNER_TAG}"*) CLIENT=1 ;; esac ;;
    esac
done < "$SERVICES"
flush_renderer
identity "$MAIN_PID" "$MAIN_TICKS" "$MAIN_UID" || : > "$TEMP"
mv "$TEMP" "$TARGET"
