#!/system/bin/sh
TASK_ROOT="$1"; SEQ=99; ATTEMPT="$2"; CONFIG="$TASK_ROOT/$ATTEMPT.json"
fatal(){ printf '%s\n' "$*" >&2; exit 3; }
write_state(){ :; }
printf '{"job":{"parentId":"synthetic-only"}}\n' > "$CONFIG"
mkdir -p "$TASK_ROOT/STARTED_ATTEMPTS/$SEQ" || fatal '无法建立启动账本'
        STARTED_COUNT=$(find "$TASK_ROOT/STARTED_ATTEMPTS/$SEQ" -type f | wc -l | tr -d ' ')
        test "$STARTED_COUNT" -lt 3 || fatal '实际启动次数已达上限'
        RUN_ORDINAL=$((STARTED_COUNT+1))
        (set -C; printf '%s\t%s\n' "$RUN_ORDINAL" "$(date +%s)" > "$TASK_ROOT/STARTED_ATTEMPTS/$SEQ/$ATTEMPT") || fatal '启动账本重复'
        { printf '{"runOrdinal":%s,' "$RUN_ORDINAL"; sed '1s/^{//' "$CONFIG"; } > "$CONFIG.ordinal"
        mv "$CONFIG.ordinal" "$CONFIG" || fatal '实际尝试序号写入失败'
        write_state starting_app

