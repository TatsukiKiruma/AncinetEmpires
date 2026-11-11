#!/system/bin/sh
# 接续门禁共用校验：完整账本必须与冻结父局和DONE标记一一对应。
chain_proc_alive() {
    case "$1:$2" in *[!0-9:]*|:*|*:) return 1 ;; esac
    test "$1" -gt 1 || return 1
    CHAIN_STAT=$(cat "/proc/$1/stat" 2>/dev/null) || return 1
    CHAIN_FIELDS=${CHAIN_STAT##*) }
    set -- "$2" $CHAIN_FIELDS
    CHAIN_EXPECTED="$1"; shift
    case "$1" in ''|Z|X|x) return 1 ;; esac
    test "$#" -ge 20 || return 1
    shift 19
    test "$1" = "$CHAIN_EXPECTED"
}
chain_field() {
    # 总调度的workers之前是顶层字段，避免误取最后一个分片的同名计数。
    sed 's/,"workers":\[.*//' "$1" 2>/dev/null |
        sed -n "s/.*\"$2\"[[:space:]]*:[[:space:]]*\"\{0,1\}\([^\",}]*\).*/\1/p"
}
chain_ledger_complete() {
    CHAIN_EXPECTED_FILE="$1"; CHAIN_LEDGER="$2"; CHAIN_MARKERS="$3"
    test -s "$CHAIN_EXPECTED_FILE" && test -s "$CHAIN_LEDGER" && test -d "$CHAIN_MARKERS" || return 1
    awk 'NR==FNR { expected[$1]=$2; n++; next }
        { count++; if(NF!=4 || !($1 in expected) || expected[$1]!=$2 || seen[$1]++ || parents[$2]++ || $3 !~ /^[A-Za-z0-9_-]+$/ || $4 !~ /^[0-9]+$/) bad=1 }
        END { if(bad || count!=n) exit 1 }' "$CHAIN_EXPECTED_FILE" "$CHAIN_LEDGER" || return 1
    CHAIN_COUNT=0
    while read -r CSEQ CPARENT CATTEMPT CEPOCH CEXTRA; do
        test -f "$CHAIN_MARKERS/$CSEQ" || return 1
        read -r MPARENT MATTEMPT MEPOCH MEXTRA < "$CHAIN_MARKERS/$CSEQ" || return 1
        test "$MPARENT:$MATTEMPT:$MEPOCH:$MEXTRA" = "$CPARENT:$CATTEMPT:$CEPOCH:" || return 1
        CHAIN_COUNT=$((CHAIN_COUNT+1))
    done < "$CHAIN_LEDGER"
    CHAIN_MARKER_COUNT=$(find "$CHAIN_MARKERS" -type f | wc -l | tr -d ' ')
    test "$CHAIN_MARKER_COUNT" = "$CHAIN_COUNT"
}
