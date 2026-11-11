"""生成可接管既有控制器的智能总调度；不重新下发或重跑父局。"""
import json
from pathlib import Path
from device import TASK
from prepare_queue import sha,replace


def main():
    out=TASK/'adaptive-01';out.mkdir(exist_ok=False)
    root=json.loads((TASK/'production-03/PLAN.json').read_text(encoding='utf-8'))['remoteRoot']
    source=(TASK/'production-03/master/master.sh').read_text(encoding='utf-8')
    source=replace(source,'GLOBAL_ROOT="$1"','umask 077\nGLOBAL_ROOT="$1"')
    position=source.index('LOCK="$GLOBAL_ROOT/master.lock"')
    initialization=r'''
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
'''
    source=source[:position]+initialization+source[position:]
    start=source.index('    if test "$CEILING_MODE" = 1;',source.index('while :; do\n    sleep 5'))
    end=source.index('    apply_limit\n',start)
    governor=r'''    PREVIOUS_LIMIT=$ACTIVE_LIMIT
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
'''
    source=source[:start]+governor+source[end:]
    source=replace(source,'    TEMP_RAW=$(dumpsys battery |','    BATTERY_DUMP=$(dumpsys battery)\n    TEMP_RAW=$(printf \'%s\\n\' "$BATTERY_DUMP" |')
    source=replace(source,'"adoptedControllers":%s,','"adoptedControllers":%s,"adaptiveReason":"%s","resourcePaused":%s,"recoveryNotBeforeUptime":%s,"recentFailureAttempts":%s,')
    source=replace(source,'"$COOL_SINCE" "$ADOPT_JSON" "$ELIGIBLE_COUNT"','"$COOL_SINCE" "$ADOPT_JSON" "$ADAPTIVE_REASON" "$RESOURCE_PAUSED" "$RECOVERY_NOT_BEFORE" "$RECENT_FAILURES" "$ELIGIBLE_COUNT"')
    (out/'master-smart-01.sh').write_text(source,encoding='utf-8',newline='\n')
    for name in ['smart_governor.sh','smart_governor_test.sh']:
        (out/name).write_bytes(Path(__file__).with_name(name).read_bytes())
    receipt={'remoteRoot':root,'operatingCeiling':3,'cpuBackoffPercent':90,'lowCpuPercent':75,'lowCpuSeconds':30,'cpuCooldownSeconds':60,
             'failureBurstCount':3,'failureWindowSeconds':120,'failureCooldownSeconds':120,'resourcePause':{'temperatureC':45,'batteryBelowPercent':20,'freeBelowGiB':2},
             'resourceResume':{'temperatureAtMostC':42,'batteryAtLeastPercent':25,'freeAtLeastGiB':2.25},'controllerRestartRequired':False}
    (out/'POLICY.json').write_text(json.dumps(receipt,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    (out/'SHA256.json').write_text(json.dumps({p.name:sha(p) for p in out.iterdir() if p.is_file()},indent=2)+'\n',encoding='utf-8')
    print(json.dumps(receipt,ensure_ascii=False))


if __name__=='__main__':
    main()
