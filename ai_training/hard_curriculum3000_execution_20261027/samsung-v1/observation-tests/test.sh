#!/system/bin/sh
. "/data/local/tmp/aeii-hard-curriculum7-samsung-observation-tests-20261028/queue_policy.sh"
for case_name in all one_failure whole_cell; do
 GLOBAL_ROOT="/data/local/tmp/aeii-hard-curriculum7-samsung-observation-tests-20261028/$case_name"
 mkdir -p "$GLOBAL_ROOT" "$GLOBAL_ROOT-w00/DONE_SEQS" "$GLOBAL_ROOT-w00/FINAL_SEQS" "$GLOBAL_ROOT-w01/DONE_SEQS" "$GLOBAL_ROOT-w01/FINAL_SEQS"
 cp /data/local/tmp/aeii-hard-curriculum7-samsung-observation-tests-20261028/cells.tsv "$GLOBAL_ROOT/OBSERVATION_CELLS.tsv"
 observation_ready; test "$?" = 1 || exit 10
 for i in $(seq 1001 1042); do
  w=w00; test "$((i%2))" != 0 || w=w01; kind=DONE_SEQS
  if test "$case_name" = one_failure && test "$i" = 1007; then kind=FINAL_SEQS; fi
  if test "$case_name" = whole_cell && { test "$i" = 1007 || test "$i" = 1028; }; then kind=FINAL_SEQS; fi
  printf fixture > "$GLOBAL_ROOT-$w/$kind/$i"
 done
 observation_ready || exit 11
 test -s "$GLOBAL_ROOT/OBSERVATION_CHECKED.json" || exit 12
 if test "$case_name" = one_failure; then test ! -s "$GLOBAL_ROOT/OBSERVATION_BLOCKED_CELLS.tsv" || exit 13; fi
 if test "$case_name" = whole_cell; then blocked_cell /data/local/tmp/aeii-hard-curriculum7-samsung-observation-tests-20261028/high2.json || exit 14; fi
done
printf 'OBSERVATION_OFFSET_OK\n'
