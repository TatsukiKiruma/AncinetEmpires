#!/system/bin/sh
. "/data/local/tmp/aeii-hard-curriculum7-queue-v5-tests-20261028/queue_policy.sh"
for case_name in empty all one_failure whole_cell; do
 GLOBAL_ROOT="/data/local/tmp/aeii-hard-curriculum7-queue-v5-tests-20261028/$case_name"
 mkdir -p "$GLOBAL_ROOT" "$GLOBAL_ROOT-w00/DONE_SEQS" "$GLOBAL_ROOT-w00/FINAL_SEQS" "$GLOBAL_ROOT-w01/DONE_SEQS" "$GLOBAL_ROOT-w01/FINAL_SEQS"
 cp /data/local/tmp/aeii-hard-curriculum7-queue-v5-tests-20261028/cells.tsv "$GLOBAL_ROOT/OBSERVATION_CELLS.tsv"
 if test "$case_name" != empty; then
  for i in $(seq 1 42); do
   w=w00; test "$((i%2))" != 0 || w=w01; kind=DONE_SEQS
   if test "$case_name" = one_failure && test "$i" = 7; then kind=FINAL_SEQS; fi
   if test "$case_name" = whole_cell && { test "$i" = 7 || test "$i" = 28; }; then kind=FINAL_SEQS; fi
   printf fixture > "$GLOBAL_ROOT-$w/$kind/$i"
  done
 fi
 observation_ready; code=$?
 if test "$case_name" = empty; then test "$code" = 1 || exit 11
 else test "$code" = 0 && test -s "$GLOBAL_ROOT/OBSERVATION_CHECKED.json" || exit 12; fi
 if test "$case_name" = one_failure; then test ! -s "$GLOBAL_ROOT/OBSERVATION_BLOCKED_CELLS.tsv" || exit 13; fi
 if test "$case_name" = whole_cell; then
  grep 'high_tier' "$GLOBAL_ROOT/OBSERVATION_BLOCKED_CELLS.tsv" >/dev/null || exit 14
  blocked_cell /data/local/tmp/aeii-hard-curriculum7-queue-v5-tests-20261028/high2.json || exit 15
  blocked_cell /data/local/tmp/aeii-hard-curriculum7-queue-v5-tests-20261028/normal2.json && exit 16
 fi
done
GLOBAL_ROOT="/data/local/tmp/aeii-hard-curriculum7-queue-v5-tests-20261028/missing-map"; mkdir "$GLOBAL_ROOT"; observation_ready; test "$?" = 2 || exit 17
mkdir -p /data/local/tmp/aeii-hard-curriculum7-queue-v5-tests-20261028/budget
# 十份未启动预留配置不能消耗实际启动预算。
for i in $(seq 1 10); do printf reserved > /data/local/tmp/aeii-hard-curriculum7-queue-v5-tests-20261028/budget/reserved-$i.json; done
for i in 1 2 3; do sh /data/local/tmp/aeii-hard-curriculum7-queue-v5-tests-20261028/claim.sh /data/local/tmp/aeii-hard-curriculum7-queue-v5-tests-20261028/budget started-$i || exit 18; done
sh /data/local/tmp/aeii-hard-curriculum7-queue-v5-tests-20261028/claim.sh /data/local/tmp/aeii-hard-curriculum7-queue-v5-tests-20261028/budget started-4 > /data/local/tmp/aeii-hard-curriculum7-queue-v5-tests-20261028/budget/fourth.log 2>&1; test "$?" = 3 || exit 19
test "$(find /data/local/tmp/aeii-hard-curriculum7-queue-v5-tests-20261028/budget/STARTED_ATTEMPTS/99 -type f | wc -l | tr -d ' ')" = 3 || exit 20
grep '"runOrdinal":3' /data/local/tmp/aeii-hard-curriculum7-queue-v5-tests-20261028/budget/started-3.json >/dev/null || exit 21
printf 'QUEUE_V5_TESTS_OK\n'
