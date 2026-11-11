#!/system/bin/sh
# 使用虚构账本验证不完整、重复和标记错配均不能触发接续。
ROOT="$1"
. "$ROOT/mi8_chain_contract.sh" || exit 2
T="$ROOT/history/gate-contract-test-$$"
mkdir -p "$T/markers" || exit 2
printf '3 parent3\n5 parent5\n' > "$T/expected"
printf '3 parent3 attempt3 100\n' > "$T/ledger"
printf 'parent3 attempt3 100\n' > "$T/markers/3"
chain_ledger_complete "$T/expected" "$T/ledger" "$T/markers" && exit 10
printf '5 parent5 attempt5 200\n' >> "$T/ledger"
printf 'parent5 attempt5 200\n' > "$T/markers/5"
chain_ledger_complete "$T/expected" "$T/ledger" "$T/markers" || exit 11
cp "$T/ledger" "$T/good"
printf '3 parent3 attempt3 100\n' >> "$T/ledger"
chain_ledger_complete "$T/expected" "$T/ledger" "$T/markers" && exit 12
cp "$T/good" "$T/ledger"
printf 'parent5 wrong-attempt 200\n' > "$T/markers/5"
chain_ledger_complete "$T/expected" "$T/ledger" "$T/markers" && exit 13
printf 'parent5 attempt5 200\n' > "$T/markers/5"
sed 's/parent5/other-parent/' "$T/good" > "$T/ledger"
chain_ledger_complete "$T/expected" "$T/ledger" "$T/markers" && exit 14
cp "$T/good" "$T/ledger"
printf 'parent9 attempt9 300\n' > "$T/markers/9"
chain_ledger_complete "$T/expected" "$T/ledger" "$T/markers" && exit 15
printf '{"schema":"fixture","phase":"complete","doneParents":1000,"workers":[{"state":{"phase":"running","doneParents":319}}]}' > "$T/state"
test "$(chain_field "$T/state" phase)" = complete || exit 16
test "$(chain_field "$T/state" doneParents)" = 1000 || exit 17
chain_proc_alive '' '' && exit 18
printf '{"passed":true,"cases":9,"fixtureDirectory":"%s","realGamesStarted":0}\n' "$T"
