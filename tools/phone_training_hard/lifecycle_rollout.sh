#!/system/bin/sh
# 本轮控制器自然排空后，原位保留分片计数与数据，只替换采集生命周期代码。
BASE=/data/local/tmp/aeii-hard-production-parallel-20261022-01
SOURCE=/data/local/tmp/aeii-hard-controller-lifecycle03-20261022.sh
EXPECTED=1d190a09f408e49531006735bae248c66fe9e683dbf8c13c965051251782a252
test "$(sha256sum "$SOURCE" | awk '{print $1}')" = "$EXPECTED" || exit 2
mkdir "$BASE/lifecycle-rollout.lock" || exit 3
SESSION="$(date +%s)-$$"
LOG="$BASE/lifecycle-rollout-$SESSION.log"
live() {
    case "$1:$2" in *[!0-9:]*|:*|*:) return 1 ;; esac
    test -r "/proc/$1/stat" && sed 's/.*) //' "/proc/$1/stat" | awk -v ticks="$2" '$1!="Z" && $1!="X" && $20==ticks {found=1} END {exit !found}'
}
log() { printf '%s\t%s\n' "$(date +%s)" "$*" >> "$LOG"; }
log '保留所有在途局，先冷却到42℃以解除既有温度暂停'
printf '0\n' > "$BASE/REQUEST_LIMIT"
while :; do
    TEMP=$(dumpsys battery | sed -n 's/^[[:space:]]*temperature:[[:space:]]*\([0-9][0-9]*\).*/\1/p')
    case "$TEMP" in ''|*[!0-9]*) sleep 5; continue ;; esac
    test "$TEMP" -le 420 && break
    sleep 5
done
printf '2\n' > "$BASE/REQUEST_LIMIT"
log '已冷却，等待现有在途局自然结束，未截断任何局'
while :; do
    COUNT=0
    while read -r WID PID TICKS ROOT; do
        live "$PID" "$TICKS" && COUNT=$((COUNT+1))
    done < "$BASE/ADOPT_CHILDREN.tsv"
    test "$COUNT" = 0 && break
    sleep 5
done
MASTER_PID=""; MASTER_TICKS=""
test ! -f "$BASE/master.lock/identity" || read -r MASTER_PID MASTER_TICKS < "$BASE/master.lock/identity"
while live "$MASTER_PID" "$MASTER_TICKS"; do sleep 2; done
log '全部旧控制器与外层调度已退出，开始替换'
for WID in w00 w01 w02; do
    ROOT="$BASE-$WID"
    PACKAGE=$(sed -n 's/^PACKAGE=//p' "$ROOT/worker.env")
    case "$WID:$PACKAGE" in w00:net.toyknight.aeii.android|w01:net.toyknight.aeii.worker01|w02:net.toyknight.aeii.worker02) ;; *) log '包身份错误，保留现场'; exit 2 ;; esac
    # 所有本任务控制器已退出，清理本次Activity自动重建的空闲宿主；不清数据。
    am force-stop "$PACKAGE" >> "$LOG" 2>&1
    cp "$ROOT/controller.sh" "$ROOT/queue-history/controller-before-lifecycle03-$SESSION.sh" || exit 2
    cp "$SOURCE" "$ROOT/controller.sh.new" || exit 2
    chown 0:0 "$ROOT/controller.sh.new"; chmod 644 "$ROOT/controller.sh.new"
    test "$(sha256sum "$ROOT/controller.sh.new" | awk '{print $1}')" = "$EXPECTED" || exit 2
    mv "$ROOT/controller.sh.new" "$ROOT/controller.sh" || exit 2
    for MARK in STOP DRAIN; do
        test ! -e "$ROOT/$MARK" || mv "$ROOT/$MARK" "$ROOT/queue-history/$MARK-before-lifecycle03-$SESSION"
    done
done
for MARK in DRAIN ADOPT_CHILDREN.tsv; do
    test ! -e "$BASE/$MARK" || mv "$BASE/$MARK" "$BASE/history/$MARK-before-lifecycle03-$SESSION"
done
log '启动相同分片与计数，最高2路，原始数据和失败尝试均保留'
setsid sh "$BASE/master-adaptive-02.sh" "$BASE" </dev/null > "$BASE/launch-lifecycle03.log" 2>&1 &
printf '{"phase":"restarted","masterPid":%s,"sourceSha256":"%s","completedPreserved":true,"applicationsDataDeleted":false}\n' "$!" "$EXPECTED" > "$BASE/LIFECYCLE_ROLLOUT.json"
log '已下发，后续无需电脑'
