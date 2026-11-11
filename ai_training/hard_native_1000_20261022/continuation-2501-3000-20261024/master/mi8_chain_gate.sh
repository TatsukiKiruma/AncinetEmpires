#!/system/bin/sh
# 手机本地等待旧段完整结束后启动新段；不向任何旧进程发送信号。
umask 077
NEXT="$1"
test "$NEXT" = /data/local/tmp/aeii-hard-production-parallel-mi8-20261024-02 || exit 2
PREVIOUS=/data/local/tmp/aeii-hard-production-parallel-20261022-01
. "$NEXT/mi8_chain_contract.sh" || exit 2
mkdir -p "$NEXT/history" || exit 2
SESSION="$(date +%s)-$$"
LOCK="$NEXT/chain.lock"
if ! mkdir "$LOCK" 2>/dev/null; then
    read -r OLD_PID OLD_TICKS < "$LOCK/identity"
    chain_proc_alive "$OLD_PID" "$OLD_TICKS" && exit 3
    mv "$LOCK" "$NEXT/history/stale-chain-lock-$SESSION" || exit 3
    mkdir "$LOCK" || exit 3
fi
SELF_TICKS=$(sed 's/.*) //' "/proc/$$/stat" | awk '{print $20}')
printf '%s\t%s\n' "$$" "$SELF_TICKS" > "$LOCK/identity"
WAKE_NAME="aeii-chain-$SESSION"
test ! -w /sys/power/wake_lock || printf '%s' "$WAKE_NAME" > /sys/power/wake_lock
release() {
    test ! -w /sys/power/wake_unlock || printf '%s' "$WAKE_NAME" > /sys/power/wake_unlock
    mv "$LOCK" "$NEXT/history/chain-lock-$SESSION" 2>/dev/null
}
trap release EXIT
write_chain() {
    printf '{"schema":"mi8-phone-local-chain-v1","phase":"%s","previousDone":%s,"previousTotal":1000,"nextTotal":500,"gatePid":%s,"gateStartTicks":%s,"updatedEpoch":%s,"computerRequired":false}\n' \
        "$1" "${OBSERVED_DONE:-0}" "$$" "$SELF_TICKS" "$(date +%s)" > "$NEXT/CHAIN_STATE.json.tmp"
    mv "$NEXT/CHAIN_STATE.json.tmp" "$NEXT/CHAIN_STATE.json"
}
lock_is_running() {
    test -d "$1" || return 1
    read -r CPID CTICKS < "$1/identity" || return 0
    chain_proc_alive "$CPID" "$CTICKS"
}
previous_finished() {
    test "$(chain_field "$PREVIOUS/STATE.json" phase)" = complete || return 1
    test "$(chain_field "$PREVIOUS/STATE.json" doneParents)" = 1000 || return 1
    for WID in w00 w01 w02; do
        WR="$PREVIOUS-$WID"
        test "$(chain_field "$WR/STATE.json" phase)" = complete || return 1
        chain_ledger_complete "$NEXT/prerequisite-$WID.tsv" "$WR/completed.tsv" "$WR/DONE_SEQS" || return 1
    done
}
previous_processes_finished() {
    lock_is_running "$PREVIOUS/master.lock" && return 1
    for WID in w00 w01 w02; do
        WR="$PREVIOUS-$WID"
        if test -d "$WR/controller.lock"; then
            CPID=$(cat "$WR/controller.lock/pid" 2>/dev/null)
            CTICKS=$(cat "$WR/controller.lock/starttime" 2>/dev/null)
            case "$CPID:$CTICKS" in *[!0-9:]*|:*|*:) return 1 ;; esac
            chain_proc_alive "$CPID" "$CTICKS" && return 1
        fi
    done
    for PKG in net.toyknight.aeii.android net.toyknight.aeii.worker01 net.toyknight.aeii.worker02; do
        test -z "$(pidof "$PKG")" || return 1
    done
    return 0
}
while :; do
    test ! -e "$NEXT/CHAIN_STOP" || { write_chain stopped; exit 0; }
    OBSERVED_DONE=$(chain_field "$PREVIOUS/STATE.json" doneParents)
    case "$OBSERVED_DONE" in ''|*[!0-9]*) OBSERVED_DONE=0 ;; esac
    if lock_is_running "$NEXT/master.lock"; then write_chain handed_off; exit 0; fi
    if ! previous_finished; then write_chain waiting_previous_completion; sleep 10; continue; fi
    if ! previous_processes_finished; then write_chain waiting_previous_processes; sleep 5; continue; fi
    # 数据身份与脚本再次核验；校验失败只阻止新段，不触碰旧段原件。
    if ! sha256sum -c "$NEXT/CHAIN_SHA256SUMS" > "$NEXT/prelaunch-hashes.log" 2>&1; then write_chain blocked_hash_mismatch; exit 2; fi
    if test -e "$NEXT/CHAIN_LAUNCH_ISSUED"; then write_chain launch_requires_inspection; exit 2; fi
    cp "$PREVIOUS/STATE.json" "$NEXT/history/previous-complete.json"
    for WID in w00 w01 w02; do cp "$PREVIOUS-$WID/completed.tsv" "$NEXT/history/previous-$WID-completed.tsv"; done
    : > "$NEXT/CHAIN_LAUNCH_ISSUED"
    write_chain starting_next
    setsid sh "$NEXT/master-adaptive-02.sh" "$NEXT" </dev/null > "$NEXT/launch.log" 2>&1 &
    WAIT=0
    while test "$WAIT" -lt 30; do
        sleep 2; WAIT=$((WAIT+1))
        if lock_is_running "$NEXT/master.lock" && test "$(chain_field "$NEXT/STATE.json" phase)" = running; then
            write_chain handed_off
            exit 0
        fi
    done
    write_chain launch_requires_inspection
    exit 2
done
