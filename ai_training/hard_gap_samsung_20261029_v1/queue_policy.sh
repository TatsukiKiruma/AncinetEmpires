#!/system/bin/sh
# 稀疏原执行局号的本地观察门禁；所有父局、worker及课程格均由冻结映射列出。
terminal_reason() {
 case "$1" in truncated|stopped|max_effective_seconds|construction_mismatch|log_integrity_failure) return 0 ;; *) return 1 ;; esac
}
is_observation_parent() {
 awk -v seq="$1" '$1==seq{found=1}END{if(found)exit 0;exit 1}' "$GLOBAL_ROOT/OBSERVATION_PARENTS.tsv"
}
observation_ready() {
 test "$(wc -l < "$GLOBAL_ROOT/OBSERVATION_PARENTS.tsv" | tr -d ' ')" = 42 || return 2
 test "$(wc -l < "$GLOBAL_ROOT/OBSERVATION_CELLS.tsv" | tr -d ' ')" = 21 || return 2
 test ! -f "$GLOBAL_ROOT/OBSERVATION_CHECKED.json" || return 0
 OBS_PENDING=0; OBS_NATURAL=0; OBS_FINAL=0; OBS_BLOCKED=0
 while read -r OBS_SEQ OBS_WID OBS_CAT OBS_PLAYERS; do
  OBS_ROOT="$GLOBAL_ROOT-$OBS_WID"
  if test -f "$OBS_ROOT/DONE_SEQS/$OBS_SEQ"; then OBS_NATURAL=$((OBS_NATURAL+1))
  elif test -f "$OBS_ROOT/FINAL_SEQS/$OBS_SEQ"; then OBS_FINAL=$((OBS_FINAL+1))
  else OBS_PENDING=1; fi
 done < "$GLOBAL_ROOT/OBSERVATION_PARENTS.tsv"
 test "$OBS_PENDING" = 0 || return 1
 OBS_OUTPUT="$GLOBAL_ROOT/.observation-blocked-$$.tmp"; : > "$OBS_OUTPUT"
 while read -r OBS_CATEGORY OBS_COUNT; do
  OBS_FOUND=0
  while read -r OBS_SEQ OBS_WID OBS_CAT OBS_PLAYERS; do
   if test "$OBS_CATEGORY/$OBS_COUNT" = "$OBS_CAT/$OBS_PLAYERS" && test -f "$GLOBAL_ROOT-$OBS_WID/DONE_SEQS/$OBS_SEQ"; then OBS_FOUND=$((OBS_FOUND+1)); fi
  done < "$GLOBAL_ROOT/OBSERVATION_PARENTS.tsv"
  if test "$OBS_FOUND" = 0; then printf '%s\t%s\n' "$OBS_CATEGORY" "$OBS_COUNT" >> "$OBS_OUTPUT"; OBS_BLOCKED=$((OBS_BLOCKED+1)); fi
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
 awk -v cat="$OBS_CAT" -v n="$OBS_COUNT" '$1==cat && $2==n{found=1}END{if(found)exit 0;exit 1}' "$GLOBAL_ROOT/OBSERVATION_BLOCKED_CELLS.tsv"
}
