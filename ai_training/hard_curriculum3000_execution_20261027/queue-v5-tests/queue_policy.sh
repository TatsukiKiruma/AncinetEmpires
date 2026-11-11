#!/system/bin/sh
# 状态文件属于本次新队列；每个父局最多三个独立尝试。
terminal_reason() {
 case "$1" in truncated|stopped|max_effective_seconds|construction_mismatch|log_integrity_failure) return 0 ;; *) return 1 ;; esac
}
observation_ready() {
 test -s "$GLOBAL_ROOT/OBSERVATION_CELLS.tsv" && test "$(wc -l < "$GLOBAL_ROOT/OBSERVATION_CELLS.tsv" | tr -d ' ')" = 21 || return 2
 test ! -f "$GLOBAL_ROOT/OBSERVATION_CHECKED.json" || return 0
 test ! -f "$GLOBAL_ROOT/OBSERVATION_FAILED" || return 2
 OBS_PENDING=0; OBS_NATURAL=0; OBS_FINAL=0; OBS_BLOCKED=0
 for OBS_SEQ in $(seq 1 42); do
  OBS_WID=w00; test "$((OBS_SEQ%2))" != 0 || OBS_WID=w01; OBS_ROOT="$GLOBAL_ROOT-$OBS_WID"
  if test -f "$OBS_ROOT/DONE_SEQS/$OBS_SEQ"; then OBS_NATURAL=$((OBS_NATURAL+1))
  elif test -f "$OBS_ROOT/FINAL_SEQS/$OBS_SEQ"; then OBS_FINAL=$((OBS_FINAL+1))
  else OBS_PENDING=1; fi
 done
 test "$OBS_PENDING" = 0 || return 1
 OBS_OUTPUT="$GLOBAL_ROOT/.observation-blocked-$$.tmp"; : > "$OBS_OUTPUT"
 while read -r OBS_FIRST OBS_CATEGORY OBS_PLAYERS; do
  OBS_FOUND=0
  for OBS_SEQ in "$OBS_FIRST" "$((OBS_FIRST+21))"; do
   OBS_WID=w00; test "$((OBS_SEQ%2))" != 0 || OBS_WID=w01
   test ! -f "$GLOBAL_ROOT-$OBS_WID/DONE_SEQS/$OBS_SEQ" || OBS_FOUND=$((OBS_FOUND+1))
  done
  # 每格两父局均已结案，至少一个自然终局证明该格的现场能力；失败父局仍保留缺口。
  if test "$OBS_FOUND" = 0; then printf '%s\t%s\n' "$OBS_CATEGORY" "$OBS_PLAYERS" >> "$OBS_OUTPUT"; OBS_BLOCKED=$((OBS_BLOCKED+1)); fi
 done < "$GLOBAL_ROOT/OBSERVATION_CELLS.tsv"
 mv "$OBS_OUTPUT" "$GLOBAL_ROOT/OBSERVATION_BLOCKED_CELLS.tsv"
 printf '{"checked":true,"parents":42,"naturalParents":%s,"terminalParents":%s,"blockedCells":%s,"minimumNaturalPerCell":1,"replay":"disabled_by_user","computerRequired":false}\n' "$OBS_NATURAL" "$OBS_FINAL" "$OBS_BLOCKED" > "$GLOBAL_ROOT/.observation-checked-$$.tmp"
 mv "$GLOBAL_ROOT/.observation-checked-$$.tmp" "$GLOBAL_ROOT/OBSERVATION_CHECKED.json"
 return 0
}
blocked_cell() {
 test -s "$GLOBAL_ROOT/OBSERVATION_BLOCKED_CELLS.tsv" || return 1
 OBS_CAT=$(sed -n 's/.*"category"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$1")
 OBS_COUNT=$(sed -n 's/.*"actualPlayerCount"[[:space:]]*:[[:space:]]*\([0-9][0-9]*\).*/\1/p' "$1")
 awk -v cat="$OBS_CAT" -v n="$OBS_COUNT" '$1==cat && $2==n{found=1}END{exit !found}' "$GLOBAL_ROOT/OBSERVATION_BLOCKED_CELLS.tsv"
}
