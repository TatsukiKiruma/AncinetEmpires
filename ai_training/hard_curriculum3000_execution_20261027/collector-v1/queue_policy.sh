#!/system/bin/sh
# 状态文件属于本次新队列；每个父局最多三个独立尝试。
terminal_reason() {
 case "$1" in truncated|stopped|max_effective_seconds|construction_mismatch|log_integrity_failure) return 0 ;; *) return 1 ;; esac
}
observation_ready() {
 test ! -f "$GLOBAL_ROOT/OBSERVATION_PASSED.json" || return 0
 test ! -f "$GLOBAL_ROOT/OBSERVATION_FAILED" || return 2
 OBS_PENDING=0
 for OBS_SEQ in $(seq 1 42); do
  OBS_WID=w00; test "$((OBS_SEQ%2))" != 0 || OBS_WID=w01
  OBS_ROOT="$GLOBAL_ROOT-$OBS_WID"
  if test -f "$OBS_ROOT/FINAL_SEQS/$OBS_SEQ"; then printf '%s\n' "观察父局$OBS_SEQ未自然完成，保留缺口" > "$GLOBAL_ROOT/OBSERVATION_FAILED"; return 2; fi
  test -f "$OBS_ROOT/DONE_SEQS/$OBS_SEQ" || OBS_PENDING=1
 done
 test "$OBS_PENDING" = 0 || return 1
 (set -C; printf '{"passed":true,"parents":42,"initialStateAndRotationAndFiles":true,"replay":"disabled_by_user","computerRequired":false}\n' > "$GLOBAL_ROOT/OBSERVATION_PASSED.json") 2>/dev/null
 return 0
}
