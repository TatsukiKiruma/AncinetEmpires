#!/system/bin/sh
BASE="$1"
. "$BASE/queue_policy.sh"
for NAME in pending all_natural one_failure blocked_cell; do
 GLOBAL_ROOT="$BASE/case-$NAME"
 mkdir -p "$GLOBAL_ROOT" "$GLOBAL_ROOT-w00/DONE_SEQS" "$GLOBAL_ROOT-w00/FINAL_SEQS" "$GLOBAL_ROOT-w01/DONE_SEQS" "$GLOBAL_ROOT-w01/FINAL_SEQS"
 cp "$BASE/OBSERVATION_PARENTS.tsv" "$GLOBAL_ROOT/OBSERVATION_PARENTS.tsv"
 cp "$BASE/OBSERVATION_CELLS.tsv" "$GLOBAL_ROOT/OBSERVATION_CELLS.tsv"
 FIRST=$(head -n 1 "$GLOBAL_ROOT/OBSERVATION_PARENTS.tsv" | awk '{print $1}')
 is_observation_parent "$FIRST" || exit 10
 is_observation_parent 999999 && exit 11
 observation_ready; test "$?" = 1 || exit 12
 test "$NAME" != pending || continue
 N=0
 while read -r SEQ WID CAT PLAYERS; do
  N=$((N+1)); KIND=DONE_SEQS
  if test "$NAME" = one_failure && test "$N" = 1; then KIND=FINAL_SEQS; fi
  if test "$NAME" = blocked_cell && { test "$N" = 1 || test "$N" = 22; }; then KIND=FINAL_SEQS; fi
  printf fixture > "$GLOBAL_ROOT-$WID/$KIND/$SEQ"
 done < "$GLOBAL_ROOT/OBSERVATION_PARENTS.tsv"
 observation_ready || exit 13
 if test "$NAME" = blocked_cell; then test "$(wc -l < "$GLOBAL_ROOT/OBSERVATION_BLOCKED_CELLS.tsv")" = 1 || exit 14
 else test ! -s "$GLOBAL_ROOT/OBSERVATION_BLOCKED_CELLS.tsv" || exit 15; fi
done
. "$BASE/smart_governor.sh"
smart_init 2 0 0
smart_update 92 300 90 10000000 0 5; test "$ACTIVE_LIMIT" = 1 || exit 21
smart_update 92 300 90 10000000 0 10; test "$ACTIVE_LIMIT" = 0 || exit 22
smart_update 20 300 90 10000000 0 11
smart_update 20 300 90 10000000 0 71; test "$ACTIVE_LIMIT" = 1 || exit 23
smart_update 20 300 90 10000000 0 102; test "$ACTIVE_LIMIT" = 2 || exit 24
smart_update 20 450 90 10000000 0 110; test "$RESOURCE_PAUSED:$ACTIVE_LIMIT" = 1:0 || exit 25
smart_update 20 420 25 2359296 0 120; test "$RESOURCE_PAUSED" = 0 || exit 26
printf 'SPARSE_QUEUE_AND_GOVERNOR_OK\n'
