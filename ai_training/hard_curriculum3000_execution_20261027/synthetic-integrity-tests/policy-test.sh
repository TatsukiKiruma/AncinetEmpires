#!/system/bin/sh
. "/data/local/tmp/aeii-hard-curriculum7-integrity-tests-20261027/queue_policy.sh"
for reason in truncated stopped construction_mismatch log_integrity_failure; do terminal_reason "$reason" || exit 11; done
for reason in app_disappeared inject_disappeared no_state_90s; do terminal_reason "$reason" && exit 12; done
GLOBAL_ROOT="/data/local/tmp/aeii-hard-curriculum7-integrity-tests-20261027/policy-complete"
mkdir -p "$GLOBAL_ROOT" "$GLOBAL_ROOT-w00/DONE_SEQS" "$GLOBAL_ROOT-w01/DONE_SEQS"
observation_ready; test "$?" = 1 || exit 13
for i in $(seq 1 42); do w=w00; test "$((i%2))" != 0 || w=w01; printf fixture > "$GLOBAL_ROOT-$w/DONE_SEQS/$i"; done
observation_ready || exit 14
test -f "$GLOBAL_ROOT/OBSERVATION_PASSED.json" || exit 15
GLOBAL_ROOT="/data/local/tmp/aeii-hard-curriculum7-integrity-tests-20261027/policy-gap"
mkdir -p "$GLOBAL_ROOT" "$GLOBAL_ROOT-w00/FINAL_SEQS" "$GLOBAL_ROOT-w01/FINAL_SEQS"
printf fixture > "$GLOBAL_ROOT-w01/FINAL_SEQS/2"
observation_ready; test "$?" = 2 || exit 16
test -f "$GLOBAL_ROOT/OBSERVATION_FAILED" || exit 17
printf 'POLICY_OK\n'
