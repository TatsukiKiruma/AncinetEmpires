#!/system/bin/sh
# 仅清理本任务无任何活进程的隔离副本崩溃Activity记录，防止三星返回空的top-most实例。
ROOT=/data/local/tmp/aeii-hard-production-parallel-samsung-20261023-03
umask 077
test -f "$ROOT/workers.tsv" || exit 2
printf '%s\n' "$$" > "$ROOT/recovery-guard.pid"
while test ! -e "$ROOT/STOP"; do
    case "$(sed -n 's/.*"phase":"\([^"]*\)".*/\1/p' "$ROOT/STATE.json")" in complete|stopped|workers_exited) break ;; esac
    while read -r WID PKG EXPECTED_UID TASK_ROOT EXTRA; do
        case "$WID:$PKG:$EXPECTED_UID" in
            w00:net.toyknight.aeii.worker11:10221|w01:net.toyknight.aeii.worker12:10222|w02:net.toyknight.aeii.worker13:10223) ;;
            *) exit 2 ;;
        esac
        test "$TASK_ROOT" = "$ROOT-$WID" && test -z "$EXTRA" || exit 2
        TEXT=$(cat "$TASK_ROOT/STATE.json" 2>/dev/null)
        case "$TEXT" in *'"phase":"starting_app"'*'"appPid":""'*) ;; *) continue ;; esac
        UPDATED=$(printf '%s\n' "$TEXT" | sed -n 's/.*"updatedEpoch":\([0-9][0-9]*\).*/\1/p')
        case "$UPDATED" in ''|*[!0-9]*) continue ;; esac
        NOW=$(date +%s); test "$((NOW-UPDATED))" -ge 10 || continue
        # 不向活进程或未知UID发信号；只在同一冻结安装身份且pidof为空时清理记录。
        test -z "$(pidof "$PKG")" || continue
        ACTUAL_UID=$(dumpsys package "$PKG" | sed -n 's/^[[:space:]]*userId=\([0-9][0-9]*\).*/\1/p')
        test "$ACTUAL_UID" = "$EXPECTED_UID" || continue
        test -z "$(pidof "$PKG")" || continue
        am force-stop "$PKG"
        printf '%s\t%s\t%s\t清理无进程的本任务崩溃Activity记录\n' "$NOW" "$WID" "$UPDATED" >> "$ROOT/recovery-events.tsv"
    done < "$ROOT/workers.tsv"
    sleep 5
done
