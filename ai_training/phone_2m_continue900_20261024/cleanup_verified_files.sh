#!/system/bin/sh
set -u
LIST=/data/local/tmp/aeii-2m-continue900-cleanup-files.tsv
LOG=/data/local/tmp/aeii-2m-continue900-cleanup-receipts.tsv
while read -r EXPECTED TARGET; do
    case "$TARGET" in /data/local/tmp/aeii-2m-*) ;; *) exit 2 ;; esac
    test -f "$TARGET" || { printf 'missing	%s
' "$TARGET" >> "$LOG"; continue; }
    ACTUAL=$(sha256sum "$TARGET" | awk '{print $1}')
    if test "$ACTUAL" != "$EXPECTED"; then printf 'mismatch	%s	%s
' "$TARGET" "$ACTUAL" >> "$LOG"; continue; fi
    SIZE=$(stat -c %s "$TARGET")
    if rm -f -- "$TARGET"; then printf 'removed	%s	%s	%s
' "$TARGET" "$SIZE" "$ACTUAL" >> "$LOG"; else printf 'failed	%s
' "$TARGET" >> "$LOG"; fi
done < "$LIST"
