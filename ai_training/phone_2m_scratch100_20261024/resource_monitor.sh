#!/system/bin/sh
# 仅写本次资源读数；失败明确标记，不把缺失传感器当安全值。
TASK=/data/local/tmp/aeii-2m-scratch100-20261024
JOB="$TASK/job"
while test ! -e "$JOB/SESSION_ENDED"; do
    EPOCH=$(date +%s)
    BATTERY=$(dumpsys battery)
    LEVEL=$(printf '%s\n' "$BATTERY" | awk '/^[[:space:]]*level:/{print $2;exit}')
    SCALE=$(printf '%s\n' "$BATTERY" | awk '/^[[:space:]]*scale:/{print $2;exit}')
    TEMP=$(printf '%s\n' "$BATTERY" | awk '/^[[:space:]]*temperature:/{print $2;exit}')
    MEMORY=$(awk '/^MemAvailable:/{print $2;exit}' /proc/meminfo)
    FREE=$(df -k "$JOB" | awk 'NR==2{print $4}')
    case "$LEVEL:$SCALE:$TEMP:$MEMORY:$FREE" in
        *[!0-9:]*|:*|*::*|*:) printf '{"valid":false,"epoch":%s,"error":"资源监测字段缺失"}\n' "$EPOCH" > "$JOB/RESOURCE.json.tmp" ;;
        *)
            if test "$SCALE" -gt 0 && test "$TEMP" -gt 0 && test "$TEMP" -lt 1000; then
                awk -v e="$EPOCH" -v l="$LEVEL" -v s="$SCALE" -v t="$TEMP" -v m="$MEMORY" -v f="$FREE" 'BEGIN{printf "{\"valid\":true,\"epoch\":%s,\"batteryPercent\":%.3f,\"temperatureC\":%.3f,\"memAvailableKiB\":%s,\"freeKiB\":%s}\n",e,l*100/s,t/10,m,f}' > "$JOB/RESOURCE.json.tmp"
            else printf '{"valid":false,"epoch":%s,"error":"资源监测数值无效"}\n' "$EPOCH" > "$JOB/RESOURCE.json.tmp"; fi ;;
    esac
    mv "$JOB/RESOURCE.json.tmp" "$JOB/RESOURCE.json"
    cat "$JOB/RESOURCE.json" >> "$JOB/RESOURCE_HISTORY.jsonl"
    sleep 5
done
